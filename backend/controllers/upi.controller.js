/**
 * UPI Controller
 */
import { Worker, UPITransaction, WageRecord, QRToken } from '../models/index.js';
import { generateReferenceNumber } from '../utils/hash.util.js';
import { successResponse, createdResponse, errorResponse, notFoundResponse } from '../utils/response.util.js';
import { generatePaymentQR, validateQRToken, useQRToken } from '../services/qr.service.js';
import { recordWagePayment, recordUPITransaction } from '../services/fabric.service.js';
import { isBlockchainEnabled, logBlockchainSkip } from '../config/blockchain.config.js';
import { logger } from '../utils/logger.util.js';
import { PAYMENT_STATUS, TRANSACTION_TYPES } from '../config/constants.js';

/**
 * Generate payment QR code for a worker
 */
export const generateQRCode = async (req, res) => {
  try {
    const { workerIdHash, bankAccountId, amount, validityMinutes } = req.body;
    
    // Find worker
    let worker;
    
    if (req.user.role === 'worker') {
      worker = await Worker.findOne({ userId: req.user.id });
    } else {
      worker = await Worker.findByIdHash(workerIdHash);
    }
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Get bank account
    let selectedAccount = null;
    
    if (bankAccountId) {
      // Use specific account
      selectedAccount = worker.bankAccounts?.id(bankAccountId);
      if (!selectedAccount) {
        return notFoundResponse(res, 'Bank account not found');
      }
    } else {
      // Use default account or first account
      selectedAccount = worker.bankAccounts?.find(acc => acc.isDefault) || 
                       worker.bankAccounts?.[0] ||
                       { accountNumber: worker.bankAccount, bankName: worker.bankName, ifscCode: worker.ifscCode };
    }
    
    if (!selectedAccount || !selectedAccount.accountNumber) {
      return errorResponse(res, 'No bank account configured for worker', 400);
    }
    
    // Generate QR code with bank account details
    // Format: account number + IFSC code + worker hash
    const qrData = `${selectedAccount.accountNumber}|${selectedAccount.ifscCode}|${worker.idHash}|${selectedAccount.bankName}`;
    const qrToken = Buffer.from(qrData).toString('base64');
    
    // Create QR token record
    const qrRecord = await QRToken.create({
      token: qrToken,
      workerHash: worker.idHash,
      workerIdHash: worker.idHash,
      workerName: worker.name,
      bankAccountId: bankAccountId || null,
      accountNumber: selectedAccount.accountNumber,
      bankName: selectedAccount.bankName,
      ifscCode: selectedAccount.ifscCode,
      accountHolderName: selectedAccount.accountHolderName,
      fixedAmount: amount,
      expiresAt: new Date(Date.now() + (validityMinutes || 5) * 60 * 1000),
      isActive: true,
      generatedBy: req.user.id,
      generatedByModel: req.user.role === 'worker' ? 'Worker' : 'Admin',
      deviceInfo: {
        ip: req.ip,
        userAgent: req.get('user-agent')
      }
    });
    
    // Generate QR code string (simplified for demo)
    // In production, use a QR library to generate actual QR code image
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrToken)}`;
    
    logger.info('QR code generated', { 
      workerId: worker._id,
      accountNumber: selectedAccount.accountNumber.slice(-4),
      token: qrToken.substring(0, 8) 
    });
    
    return successResponse(res, {
      qrCode: qrCodeUrl,
      token: qrToken,
      expiresAt: qrRecord.expiresAt,
      worker: {
        name: worker.name,
        idHash: worker.idHash,
        maskedAadhaar: worker.aadhaarLast4 ? `****-****-${worker.aadhaarLast4}` : null
      },
      bankAccount: {
        accountNumber: selectedAccount.accountNumber.replace(/(.{4})/g, '$1****').replace(/\*+$/, selectedAccount.accountNumber.slice(-4)),
        accountHolderName: selectedAccount.accountHolderName,
        bankName: selectedAccount.bankName,
        ifscCode: selectedAccount.ifscCode
      },
      amount
    }, 'QR code generated successfully');
    
  } catch (error) {
    logger.error('Generate QR code error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Validate a QR token (scan QR)
 */
export const scanQRCode = async (req, res) => {
  try {
    const { token } = req.body;
    
    const validation = await validateQRToken(token);
    
    if (!validation.valid) {
      return errorResponse(res, validation.error, 400);
    }
    
    return successResponse(res, {
      valid: true,
      worker: {
        idHash: validation.qrToken.workerIdHash,
        name: validation.qrToken.workerName,
        account: validation.qrToken.workerAccount
      },
      amount: validation.qrToken.fixedAmount,
      expiresAt: validation.qrToken.expiresAt
    });
    
  } catch (error) {
    logger.error('Scan QR code error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Process UPI payment
 */
export const processUPIPayment = async (req, res) => {
  try {
    const { workerIdHash, amount, senderName, senderPhone, senderUPI, qrToken, remarks } = req.body;
    
    // Find worker
    const worker = await Worker.findByIdHash(workerIdHash);
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Get employer info if user is an employer
    let employer = null;
    let employerIdHash = null;
    if (req.user.role === 'employer') {
      const { Employer } = await import('../models/index.js');
      employer = await Employer.findOne({ userId: req.user.id });
      employerIdHash = employer?.idHash;
    }
    
    // Validate QR token if provided
    if (qrToken) {
      const validation = await validateQRToken(qrToken);
      if (!validation.valid) {
        return errorResponse(res, validation.error, 400);
      }
      
      // Check amount matches if fixed amount QR
      if (validation.qrToken.fixedAmount && validation.qrToken.fixedAmount !== amount) {
        return errorResponse(res, 'Amount does not match QR code', 400);
      }
    }
    
    // Generate transaction ID and reference
    const txId = `UPI${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const transactionRef = generateReferenceNumber('UPI');
    
    // Create UPI transaction with employer tracking
    const upiTransaction = await UPITransaction.create({
      txId,
      workerId: worker._id,
      employerId: employer?._id,
      workerHash: workerIdHash,
      workerName: worker.name,
      workerAccount: worker.bankAccount,
      workerUPI: worker.upiId,
      amount,
      senderName: employer?.companyName || senderName,
      senderPhone,
      senderUPI,
      transactionRef,
      mode: qrToken ? 'QR_SCAN' : 'UPI',
      status: PAYMENT_STATUS.PENDING,
      remarks,
      deviceInfo: {
        ip: req.ip,
        userAgent: req.get('user-agent')
      }
    });
    
    // Create wage record with employer tracking
    const wageRecord = await WageRecord.create({
      workerId: worker._id,
      workerIdHash,
      employerId: employer?._id,
      employerIdHash: employerIdHash,
      amount,
      paymentMethod: 'upi',
      referenceNumber: transactionRef,
      transactionType: TRANSACTION_TYPES.WAGE,
      upiTransactionId: upiTransaction._id,
      status: PAYMENT_STATUS.PENDING,
      source: qrToken ? 'qr_scan' : 'manual',
      incomeSource: employer?.companyName || senderName || 'UPI Payment',
      isVerified: false,
      metadata: {
        senderName: employer?.companyName || senderName,
        senderPhone: senderPhone,
        senderUPI: senderUPI,
        paymentMode: qrToken ? 'QR_SCAN' : 'UPI_DIRECT'
      }
    });
    
    // Simulate payment processing (in production, integrate with UPI gateway)
    // For now, mark as completed
    upiTransaction.status = PAYMENT_STATUS.COMPLETED;
    upiTransaction.completedAt = new Date();
    upiTransaction.upiRef = `UPI${Date.now()}`;
    
    // Record on blockchain with complete transaction details
    let blockchainResult = { success: false };
    if (isBlockchainEnabled()) {
      // Record UPI transaction on blockchain with all details
      blockchainResult = await recordUPITransaction({
        txId: txId,
        workerIdHash: workerIdHash,
        employerIdHash: employerIdHash,
        amount: amount,
        senderName: employer?.companyName || senderName || 'Anonymous',
        senderPhone: senderPhone || employer?.phone || '',
        senderUPI: senderUPI || '',
        transactionRef: transactionRef,
        paymentMethod: qrToken ? 'QR_CODE' : 'UPI'
      });
      
      if (blockchainResult.success) {
        upiTransaction.blockchainTxId = blockchainResult.txId;
        upiTransaction.verifiedOnChain = true;
        logger.info('✓ Payment recorded on blockchain', { 
          txId, 
          workerName: worker.name,
          senderName: employer?.companyName || senderName,
          amount 
        });
      } else {
        logger.warn('⚠ Blockchain recording failed, transaction saved to database only', {
          txId,
          error: blockchainResult.error
        });
      }
    } else {
      logBlockchainSkip('RecordUPITransaction', logger);
    }
    
    await upiTransaction.save();
    
    // Update wage record
    wageRecord.status = PAYMENT_STATUS.COMPLETED;
    wageRecord.completedAt = new Date();
    wageRecord.blockchainTxId = blockchainResult.txId || null;
    wageRecord.verifiedOnChain = blockchainResult.success;
    wageRecord.syncedToBlockchain = blockchainResult.success;
    await wageRecord.save();
    
    // Update worker balance
    await worker.updateIncome(amount);
    
    // Mark QR token as used
    if (qrToken) {
      await useQRToken(qrToken, req.user?.id, upiTransaction._id);
    }
    
    logger.info('UPI payment processed successfully', { 
      txId, 
      amount,
      workerName: worker.name,
      senderName: employer?.companyName || senderName,
      workerIdHash: workerIdHash.substring(0, 8),
      blockchainRecorded: blockchainResult.success
    });
    
    return createdResponse(res, {
      transaction: {
        txId,
        transactionRef,
        amount,
        status: upiTransaction.status,
        workerName: worker.name,
        senderName: employer?.companyName || senderName,
        blockchainTxId: upiTransaction.blockchainTxId,
        verifiedOnChain: upiTransaction.verifiedOnChain,
        timestamp: upiTransaction.completedAt
      },
      blockchain: {
        recorded: blockchainResult.success,
        txId: blockchainResult.txId,
        mock: blockchainResult.mock || false
      }
    }, blockchainResult.success ? 'Payment successful and recorded on blockchain' : 'Payment successful (database only)');
    
  } catch (error) {
    logger.error('Process UPI payment error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get UPI transaction history
 */
export const getUPITransactions = async (req, res) => {
  try {
    const { workerIdHash, status, startDate, endDate } = req.query;
    
    const query = {};
    
    if (workerIdHash) {
      query.workerHash = workerIdHash;
    }
    
    // Role-based filtering
    if (req.user.role === 'worker') {
      const worker = await Worker.findOne({ userId: req.user.id });
      query.workerHash = worker?.idHash;
    }
    
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const transactions = await UPITransaction.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(req.query.limit) || 50);
    
    return successResponse(res, transactions);
    
  } catch (error) {
    logger.error('Get UPI transactions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get UPI transaction by ID
 */
export const getUPITransactionById = async (req, res) => {
  try {
    const transaction = await UPITransaction.findOne({ txId: req.params.txId })
      .populate('workerId', 'name phone');
    
    if (!transaction) {
      return notFoundResponse(res, 'Transaction not found');
    }
    
    return successResponse(res, transaction);
    
  } catch (error) {
    logger.error('Get UPI transaction error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker's active QR tokens
 */
export const getActiveQRTokens = async (req, res) => {
  try {
    let worker;
    
    if (req.params.workerId) {
      worker = await Worker.findById(req.params.workerId);
    } else if (req.user.role === 'worker') {
      worker = await Worker.findOne({ userId: req.user.id });
    }
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    const tokens = await QRToken.find({
      workerId: worker._id,
      isExpired: false,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    }).select('token fixedAmount expiresAt qrImageUrl createdAt');
    
    return successResponse(res, tokens);
    
  } catch (error) {
    logger.error('Get active QR tokens error:', error);
    return errorResponse(res, error.message, 500);
  }
};

export default {
  generateQRCode,
  scanQRCode,
  processUPIPayment,
  getUPITransactions,
  getUPITransactionById,
  getActiveQRTokens
};
