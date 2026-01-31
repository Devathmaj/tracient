/**
 * Wage/Transaction Controller
 */
import { WageRecord, Worker, Employer, UPITransaction, AuditLog, AnomalyAlert } from '../models/index.js';
import { generateReferenceNumber } from '../utils/hash.util.js';
import { successResponse, createdResponse, errorResponse, notFoundResponse, paginatedResponse } from '../utils/response.util.js';
import { paginateQuery } from '../utils/pagination.util.js';
import { recordWagePayment } from '../services/fabric.service.js';
import { detectAnomaly } from '../services/ai.service.js';
import { sendPaymentNotification } from '../services/email.service.js';
import { logger } from '../utils/logger.util.js';
import { PAYMENT_STATUS, TRANSACTION_TYPES } from '../config/constants.js';
import { isBlockchainEnabled, logBlockchainSkip } from '../config/blockchain.config.js';

/**
 * Create a wage payment
 */
export const createWagePayment = async (req, res) => {
  try {
    const { workerIdHash, workerID, amount, paymentMethod, description, workPeriod, jobType, date } = req.body;
    
    // Resolve worker - support both workerIdHash and workerID
    let worker;
    let resolvedWorkerIdHash = workerIdHash;
    
    if (workerIdHash) {
      // Find by hash
      worker = await Worker.findByIdHash(workerIdHash);
    } else if (workerID) {
      // Find by display ID or name (for flexibility)
      worker = await Worker.findOne({
        $or: [
          { _id: workerID.match(/^[0-9a-fA-F]{24}$/) ? workerID : null },
          { idHash: { $regex: workerID, $options: 'i' } },
          { name: { $regex: workerID, $options: 'i' } }
        ].filter(q => q !== null && Object.values(q)[0] !== null)
      });
      if (worker) {
        resolvedWorkerIdHash = worker.idHash;
      }
    }
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Get employer (if employer role)
    let employer = null;
    if (req.user.role === 'employer') {
      employer = await Employer.findOne({ userId: req.user.id });
      if (!employer) {
        return errorResponse(res, 'Employer profile not found', 400);
      }
    }
    
    // Generate reference number
    const referenceNumber = generateReferenceNumber('WAGE');
    
    // Create wage record
    const wageRecord = await WageRecord.create({
      workerId: worker._id,
      employerId: employer?._id,
      workerIdHash: resolvedWorkerIdHash,
      amount,
      paymentMethod: paymentMethod || 'bank_transfer',
      description: description || jobType,
      workPeriod: workPeriod || (date ? { startDate: new Date(date) } : undefined),
      referenceNumber,
      transactionType: TRANSACTION_TYPES.WAGE,
      status: PAYMENT_STATUS.PENDING,
      source: employer ? 'employer' : 'manual',
      incomeSource: employer ? employer.companyName : 'Direct Payment',
      isVerified: !!employer,
      syncedToBlockchain: false,
      statusHistory: [{
        status: PAYMENT_STATUS.PENDING,
        timestamp: new Date(),
        note: 'Payment initiated'
      }]
    });
    
    // Check for anomalies
    const recentTransactions = await WageRecord.find({
      workerId: worker._id,
      status: PAYMENT_STATUS.COMPLETED
    }).sort({ createdAt: -1 }).limit(10);
    
    const avgAmount = recentTransactions.length > 0
      ? recentTransactions.reduce((sum, t) => sum + t.amount, 0) / recentTransactions.length
      : amount;
    
    const anomalyResult = await detectAnomaly({
      amount,
      historicalAvg: avgAmount,
      transactionCount24h: await WageRecord.countDocuments({
        workerId: worker._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      lastTransactionTime: recentTransactions[0]?.createdAt
    });
    
    // Create anomaly alert if detected
    if (anomalyResult.isAnomaly && anomalyResult.confidence > 50) {
      await AnomalyAlert.create({
        alertType: anomalyResult.anomalyType || 'unusual_pattern',
        severity: anomalyResult.confidence > 80 ? 'high' : 'medium',
        entityType: 'transaction',
        entityId: wageRecord._id,
        entityModel: 'WageRecord',
        workerId: worker._id,
        workerIdHash,
        title: `Potential ${anomalyResult.anomalyType} detected`,
        description: `Transaction of ₹${amount} flagged. ${anomalyResult.details?.ruleBased?.reasons?.join('. ') || ''}`,
        confidence: anomalyResult.confidence,
        evidence: {
          expectedValue: avgAmount,
          actualValue: amount,
          additionalData: anomalyResult.details
        }
      });
      
      logger.warn('Anomaly detected in transaction', { 
        wageRecordId: wageRecord._id, 
        type: anomalyResult.anomalyType 
      });
    }
    
    // Simulate payment completion (in production, integrate with payment gateway)
    wageRecord.status = PAYMENT_STATUS.COMPLETED;
    wageRecord.completedAt = new Date();
    wageRecord.statusHistory.push({
      status: PAYMENT_STATUS.COMPLETED,
      timestamp: new Date(),
      note: 'Payment completed'
    });
    
    // Record on blockchain (only if enabled)
    if (isBlockchainEnabled()) {
      const blockchainResult = await recordWagePayment({
        workerId: worker._id,
        workerIdHash,
        employerId: employer?._id,
        amount,
        referenceNumber,
        timestamp: new Date()
      });
      
      if (blockchainResult.success) {
        wageRecord.verifiedOnChain = true;
        wageRecord.blockchainTxId = blockchainResult.txHash;
      }
    } else {
      logBlockchainSkip('RecordWagePayment', logger);
      wageRecord.verifiedOnChain = false;
      wageRecord.syncedToBlockchain = false;
    }
    
    await wageRecord.save();
    
    // Update worker balance
    await worker.updateIncome(amount);
    
    // Update employer stats
    if (employer) {
      await employer.updateWageStats(amount);
    }
    
    // Log transaction
    AuditLog.logTransaction('wage_payment', req.user.id, wageRecord._id, {
      newValue: { amount, workerIdHash, referenceNumber }
    }, req);
    
    // Send notification
    sendPaymentNotification(worker, {
      amount,
      employerName: employer?.companyName,
      referenceNumber,
      timestamp: new Date()
    });
    
    logger.info('Wage payment created', { 
      wageRecordId: wageRecord._id, 
      amount, 
      workerIdHash: workerIdHash.substring(0, 8) 
    });
    
    return createdResponse(res, {
      transaction: {
        id: wageRecord._id,
        referenceNumber,
        amount,
        status: wageRecord.status,
        blockchainTxId: wageRecord.blockchainTxId,
        workerName: worker.name
      },
      anomalyWarning: anomalyResult.isAnomaly ? {
        type: anomalyResult.anomalyType,
        confidence: anomalyResult.confidence
      } : null
    }, 'Payment processed successfully');
    
  } catch (error) {
    logger.error('Create wage payment error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get all transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const { status, startDate, endDate, minAmount, maxAmount, workerId, employerId } = req.query;
    
    const query = {};
    
    // Apply filters based on user role
    if (req.user.role === 'worker') {
      const worker = await Worker.findOne({ userId: req.user.id });
      query.workerId = worker?._id;
    } else if (req.user.role === 'employer') {
      const employer = await Employer.findOne({ userId: req.user.id });
      query.employerId = employer?._id;
    }
    
    if (status) query.status = status;
    if (workerId) query.workerId = workerId;
    if (employerId) query.employerId = employerId;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }
    
    const { data, pagination } = await paginateQuery(WageRecord, query, {
      ...req.query,
      populate: [
        { path: 'workerId', select: 'name idHash' },
        { path: 'employerId', select: 'companyName' }
      ],
      defaultSort: '-createdAt'
    });
    
    return paginatedResponse(res, data, pagination);
    
  } catch (error) {
    logger.error('Get transactions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get transaction by ID
 */
export const getTransactionById = async (req, res) => {
  try {
    const transaction = await WageRecord.findById(req.params.id)
      .populate('workerId', 'name idHash phone')
      .populate('employerId', 'companyName contactPerson');
    
    if (!transaction) {
      return notFoundResponse(res, 'Transaction not found');
    }
    
    return successResponse(res, transaction);
    
  } catch (error) {
    logger.error('Get transaction by ID error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get transaction statistics
 */
export const getTransactionStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchStage = {};
    
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }
    
    // Apply role-based filtering
    if (req.user.role === 'employer') {
      const employer = await Employer.findOne({ userId: req.user.id });
      if (employer) matchStage.employerId = employer._id;
    }
    
    const stats = await WageRecord.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);
    
    const dailyStats = await WageRecord.aggregate([
      { $match: { ...matchStage, status: PAYMENT_STATUS.COMPLETED } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);
    
    const summary = {
      total: stats.reduce((sum, s) => sum + s.count, 0),
      totalAmount: stats.reduce((sum, s) => sum + s.totalAmount, 0),
      byStatus: stats.reduce((acc, s) => {
        acc[s._id] = { count: s.count, totalAmount: s.totalAmount, avgAmount: s.avgAmount };
        return acc;
      }, {}),
      dailyTrend: dailyStats.reverse()
    };
    
    return successResponse(res, summary);
    
  } catch (error) {
    logger.error('Get transaction stats error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Cancel a pending transaction
 */
export const cancelTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const transaction = await WageRecord.findById(id);
    
    if (!transaction) {
      return notFoundResponse(res, 'Transaction not found');
    }
    
    if (transaction.status !== PAYMENT_STATUS.PENDING) {
      return errorResponse(res, 'Only pending transactions can be cancelled', 400);
    }
    
    transaction.status = PAYMENT_STATUS.CANCELLED;
    transaction.statusHistory.push({
      status: PAYMENT_STATUS.CANCELLED,
      timestamp: new Date(),
      note: reason || 'Cancelled by user',
      updatedBy: req.user.id
    });
    
    await transaction.save();
    
    AuditLog.logTransaction('transaction_cancelled', req.user.id, id, {
      newValue: { reason }
    }, req);
    
    return successResponse(res, transaction, 'Transaction cancelled');
    
  } catch (error) {
    logger.error('Cancel transaction error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Process bulk transactions
 */
export const processBulkTransactions = async (req, res) => {
  try {
    const { transactions } = req.body;
    
    const employer = await Employer.findOne({ userId: req.user.id });
    if (!employer && req.user.role === 'employer') {
      return errorResponse(res, 'Employer profile not found', 400);
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Collect all successful wages for batch blockchain sync
    const wagesForBlockchain = [];
    
    for (const tx of transactions) {
      try {
        const worker = await Worker.findByIdHash(tx.workerIdHash);
        
        if (!worker) {
          results.failed.push({
            workerIdHash: tx.workerIdHash,
            error: 'Worker not found'
          });
          continue;
        }
        
        const referenceNumber = generateReferenceNumber('BULK');
        
        const wageRecord = await WageRecord.create({
          workerId: worker._id,
          employerId: employer?._id,
          workerIdHash: tx.workerIdHash,
          amount: tx.amount,
          paymentMethod: tx.paymentMethod || 'bank_transfer',
          description: tx.description,
          referenceNumber,
          transactionType: TRANSACTION_TYPES.WAGE,
          status: PAYMENT_STATUS.COMPLETED,
          source: employer ? 'employer' : 'bulk_upload',
          incomeSource: employer ? employer.companyName : (tx.incomeSource || 'Bulk Upload'),
          isVerified: !!employer,
          completedAt: new Date(),
          syncedToBlockchain: false // Mark for blockchain sync
        });
        
        await worker.updateIncome(tx.amount);
        
        results.successful.push({
          workerIdHash: tx.workerIdHash,
          amount: tx.amount,
          referenceNumber,
          transactionId: wageRecord._id
        });
        
        // Add to blockchain batch
        wagesForBlockchain.push({
          wageId: wageRecord._id,
          workerIdHash: tx.workerIdHash,
          employerIdHash: employer?.idHash || 'SELF_DECLARED',
          amount: tx.amount,
          referenceNumber,
          description: tx.description || 'labor',
          initiatedAt: new Date()
        });
        
      } catch (error) {
        results.failed.push({
          workerIdHash: tx.workerIdHash,
          error: error.message
        });
      }
    }
    
    // Batch record on blockchain if enabled
    if (isBlockchainEnabled() && wagesForBlockchain.length > 0) {
      try {
        const { batchRecordWages } = await import('../services/fabric.service.js');
        const blockchainResult = await batchRecordWages(wagesForBlockchain);
        
        if (blockchainResult.success) {
          // Update all wage records with blockchain status
          const wageIds = wagesForBlockchain.map(w => w.wageId);
          await WageRecord.updateMany(
            { _id: { $in: wageIds } },
            { 
              syncedToBlockchain: true, 
              verifiedOnChain: true,
              blockchainTxId: `BATCH-${Date.now()}`
            }
          );
          
          logger.info('Bulk wages recorded on blockchain', { count: wagesForBlockchain.length });
        } else {
          logger.warn('Bulk blockchain recording failed, will retry via sync service', { 
            error: blockchainResult.error 
          });
        }
      } catch (blockchainError) {
        logger.error('Bulk blockchain recording error:', blockchainError.message);
        // Don't fail the operation - sync service will handle it
      }
    } else if (!isBlockchainEnabled()) {
      logBlockchainSkip('BatchRecordWages', logger);
    }
    
    logger.info('Bulk transactions processed', {
      successful: results.successful.length,
      failed: results.failed.length
    });
    
    return successResponse(res, results, 
      `Processed ${results.successful.length} of ${transactions.length} transactions`);
    
  } catch (error) {
    logger.error('Bulk transactions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

export default {
  createWagePayment,
  getTransactions,
  getTransactionById,
  getTransactionStats,
  cancelTransaction,
  processBulkTransactions
};
