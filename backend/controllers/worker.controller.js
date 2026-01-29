/**
 * Worker Controller
 */
import { Worker, User, WageRecord, AuditLog, UPITransaction } from '../models/index.js';
import { generateIdHash } from '../utils/hash.util.js';
import { calculateBPLStatus, calculateIncomeTrend } from '../utils/bpl.util.js';
import { successResponse, createdResponse, errorResponse, notFoundResponse, paginatedResponse } from '../utils/response.util.js';
import { paginateQuery } from '../utils/pagination.util.js';
import { registerWorkerOnChain, updateWorkerClassification } from '../services/fabric.service.js';
import { classifyBPL } from '../services/ai.service.js';
import { logger } from '../utils/logger.util.js';
import { VERIFICATION_STATUS, ROLES } from '../config/constants.js';
import { isBlockchainEnabled, logBlockchainSkip } from '../config/blockchain.config.js';

/**
 * Create a new worker
 */
export const createWorker = async (req, res) => {
  try {
    const { aadhaarNumber, name, phone, bankAccount, ...additionalData } = req.body;
    
    // Generate idHash
    const idHash = generateIdHash(aadhaarNumber);
    
    // Check for existing worker
    const existingWorker = await Worker.findOne({ idHash });
    if (existingWorker) {
      return errorResponse(res, 'Worker with this Aadhaar already registered', 409);
    }
    
    // Create user account if not exists
    let user = await User.findOne({ idHash });
    if (!user) {
      user = await User.create({
        email: `worker_${idHash.substring(0, 8)}@tracient.local`,
        password: phone, // Temporary password
        name,
        role: ROLES.WORKER,
        idHash,
        phone
      });
    }
    
    // Create worker profile
    const worker = await Worker.create({
      userId: user._id,
      idHash,
      name,
      phone,
      bankAccount,
      aadhaarLast4: aadhaarNumber.slice(-4),
      employmentType: additionalData.employmentType || 'informal',
      isFarmer: additionalData.isFarmer || false,
      kccLimit: additionalData.kccLimit || 0,
      ...additionalData
    });
    
    // Register on blockchain (only if enabled)
    if (isBlockchainEnabled()) {
      registerWorkerOnChain({ idHash, name, registeredAt: worker.registeredAt });
    } else {
      logBlockchainSkip('RegisterWorker in createWorker', logger);
    }
    
    // Log
    AuditLog.log({
      action: 'worker_created',
      category: 'worker',
      userId: req.user?.id,
      resourceType: 'Worker',
      resourceId: worker._id,
      description: `Worker ${name} created`
    });
    
    logger.info('Worker created', { workerId: worker._id, idHash: idHash.substring(0, 8) });
    
    return createdResponse(res, {
      worker: {
        id: worker._id,
        idHash: worker.idHash,
        name: worker.name,
        phone: worker.phone,
        maskedAadhaar: worker.maskedAadhaar,
        verificationStatus: worker.verificationStatus
      }
    }, 'Worker registered successfully');
    
  } catch (error) {
    logger.error('Create worker error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get all workers (with pagination)
 */
export const getWorkers = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    
    const query = {};
    
    if (status) {
      query.verificationStatus = status;
    }
    
    if (category) {
      query.incomeCategory = category;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const { data, pagination } = await paginateQuery(Worker, query, {
      ...req.query,
      select: '-blockchainTxIds',
      defaultSort: '-createdAt'
    });
    
    return paginatedResponse(res, data, pagination, 'Workers retrieved successfully');
    
  } catch (error) {
    logger.error('Get workers error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker by ID
 */
export const getWorkerById = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id)
      .populate('currentEmployerId', 'companyName')
      .populate('verifiedBy', 'name designation');
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    return successResponse(res, worker);
    
  } catch (error) {
    logger.error('Get worker by ID error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker by idHash
 */
export const getWorkerByIdHash = async (req, res) => {
  try {
    const worker = await Worker.findByIdHash(req.params.idHash);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Don't expose sensitive data for non-owner requests
    const isOwner = req.user?.idHash === worker.idHash;
    const isPrivileged = [ROLES.ADMIN, ROLES.GOVERNMENT, ROLES.EMPLOYER].includes(req.user?.role);
    
    if (!isOwner && !isPrivileged) {
      return successResponse(res, {
        idHash: worker.idHash,
        name: worker.name,
        verificationStatus: worker.verificationStatus,
        incomeCategory: worker.incomeCategory
      });
    }
    
    return successResponse(res, worker);
    
  } catch (error) {
    logger.error('Get worker by idHash error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update worker
 */
export const updateWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove protected fields
    delete updates.idHash;
    delete updates.userId;
    delete updates.verificationStatus;
    delete updates.verifiedBy;
    
    const worker = await Worker.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    AuditLog.log({
      action: 'worker_updated',
      category: 'worker',
      userId: req.user.id,
      resourceType: 'Worker',
      resourceId: worker._id,
      changes: Object.keys(updates).map(key => ({
        field: key,
        newValue: updates[key]
      }))
    });
    
    return successResponse(res, worker, 'Worker updated successfully');
    
  } catch (error) {
    logger.error('Update worker error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Verify worker (Government official action)
 */
export const verifyWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const worker = await Worker.findById(id);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    worker.verificationStatus = status;
    worker.verifiedBy = req.user.id;
    worker.verifiedAt = new Date();
    worker.verificationNotes = notes;
    
    await worker.save();
    
    // Update user verification status
    await User.findOneAndUpdate(
      { idHash: worker.idHash },
      { isVerified: status === VERIFICATION_STATUS.VERIFIED }
    );
    
    AuditLog.logVerification('worker_verified', req.user.id, 'Worker', id, {
      newValue: { status, notes }
    });
    
    logger.info('Worker verified', { workerId: id, status });
    
    return successResponse(res, worker, `Worker ${status}`);
    
  } catch (error) {
    logger.error('Verify worker error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker income summary
 */
export const getWorkerIncomeSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const { months = 12 } = req.query;
    
    const worker = await Worker.findById(id);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Get wage records
    const wageRecords = await WageRecord.find({
      workerId: id,
      status: 'completed'
    }).sort({ createdAt: -1 });
    
    // Calculate BPL status
    const bplStatus = await classifyBPL(wageRecords);
    
    // Calculate trend
    const trend = calculateIncomeTrend(wageRecords, parseInt(months));
    
    // Update worker if classification changed
    if (bplStatus.category !== worker.incomeCategory) {
      worker.incomeCategory = bplStatus.category;
      worker.annualIncome = bplStatus.annualIncome;
      worker.lastClassificationDate = new Date();
      await worker.save();
      
      // Update on blockchain
      updateWorkerClassification(worker.idHash, bplStatus.category, bplStatus.annualIncome);
    }
    
    return successResponse(res, {
      worker: {
        id: worker._id,
        name: worker.name,
        incomeCategory: worker.incomeCategory
      },
      income: bplStatus,
      trend,
      transactionCount: wageRecords.length
    });
    
  } catch (error) {
    logger.error('Get income summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker transactions
 */
export const getWorkerTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    
    const worker = await Worker.findById(id);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    const { data, pagination } = await paginateQuery(
      WageRecord,
      { workerId: id },
      {
        ...req.query,
        populate: 'employerId',
        defaultSort: '-createdAt'
      }
    );
    
    return paginatedResponse(res, data, pagination);
    
  } catch (error) {
    logger.error('Get worker transactions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get BPL workers
 */
export const getBPLWorkers = async (req, res) => {
  try {
    const { data, pagination } = await paginateQuery(
      Worker,
      { 
        incomeCategory: 'BPL',
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        isActive: true 
      },
      {
        ...req.query,
        select: 'idHash name phone incomeCategory annualIncome address',
        defaultSort: 'annualIncome'
      }
    );
    
    return paginatedResponse(res, data, pagination, 'BPL workers retrieved');
    
  } catch (error) {
    logger.error('Get BPL workers error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Delete worker (Admin only)
 */
export const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;
    
    const worker = await Worker.findById(id);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    // Soft delete - just mark as inactive
    worker.isActive = false;
    await worker.save();
    
    // Also deactivate user
    await User.findByIdAndUpdate(worker.userId, { isActive: false });
    
    AuditLog.log({
      action: 'worker_deleted',
      category: 'worker',
      userId: req.user.id,
      resourceType: 'Worker',
      resourceId: id
    });
    
    return successResponse(res, null, 'Worker deactivated successfully');
    
  } catch (error) {
    logger.error('Delete worker error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get current worker's profile
 */
export const getMyProfile = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id })
      .populate('userId', 'email role isActive lastLogin createdAt')
      .populate('currentEmployerId', 'name businessType registrationNumber')
      .populate('enrolledSchemes.schemeId', 'name description benefits')
      .lean();
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    // Format response with all personal and address info
    const profileData = {
      _id: worker._id,
      personalInfo: {
        firstName: worker.name ? worker.name.split(' ')[0] : '',
        lastName: worker.name ? worker.name.split(' ').slice(1).join(' ') : '',
        dateOfBirth: worker.dateOfBirth,
        gender: worker.gender,
        phone: worker.phone,
        alternatePhone: worker.alternatePhone,
        email: worker.userId?.email || '',
        aadhaarHash: worker.idHash,
        aadhaarLast4: worker.aadhaarLast4,
        occupation: worker.occupation,
        skills: worker.skills || []
      },
      employmentInfo: {
        employmentType: worker.employmentType || 'informal',
        isFarmer: worker.isFarmer || false,
        kccLimit: worker.kccLimit || 0,
        currentEmployerId: worker.currentEmployerId,
        occupation: worker.occupation
      },
      addressInfo: {
        street: worker.address?.street || '',
        city: worker.address?.city || '',
        state: worker.address?.state || '',
        postalCode: worker.address?.pincode || '',
        district: worker.address?.district || '',
        country: 'India'
      },
      bankAccounts: worker.bankAccounts || [],
      financialInfo: {
        totalEarnings: worker.totalEarnings,
        balance: worker.balance,
        annualIncome: worker.annualIncome,
        incomeCategory: worker.incomeCategory,
        lastClassificationDate: worker.lastClassificationDate
      },
      verificationInfo: {
        verificationStatus: worker.verificationStatus,
        verifiedAt: worker.verifiedAt,
        verificationNotes: worker.verificationNotes
      },
      enrolledSchemes: worker.enrolledSchemes || [],
      timestamps: {
        registeredAt: worker.registeredAt,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
        lastActiveAt: worker.lastActiveAt
      }
    };
    
    return successResponse(res, profileData);
  } catch (error) {
    logger.error('Get my profile error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update current worker's profile
 */
export const updateMyProfile = async (req, res) => {
  try {
    const { personalInfo, addressInfo, bankDetails, employmentInfo } = req.body;
    
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    // Update personal information
    if (personalInfo) {
      if (personalInfo.firstName || personalInfo.lastName) {
        const firstName = personalInfo.firstName || '';
        const lastName = personalInfo.lastName || '';
        worker.name = `${firstName} ${lastName}`.trim();
      }
      if (personalInfo.dateOfBirth) worker.dateOfBirth = personalInfo.dateOfBirth;
      if (personalInfo.gender) worker.gender = personalInfo.gender;
      if (personalInfo.phone) worker.phone = personalInfo.phone;
      if (personalInfo.alternatePhone) worker.alternatePhone = personalInfo.alternatePhone;
      if (personalInfo.occupation) worker.occupation = personalInfo.occupation;
      if (Array.isArray(personalInfo.skills)) worker.skills = personalInfo.skills;
    }
    
    // Update employment information
    if (employmentInfo) {
      if (employmentInfo.employmentType) worker.employmentType = employmentInfo.employmentType;
      if (typeof employmentInfo.isFarmer === 'boolean') worker.isFarmer = employmentInfo.isFarmer;
      if (typeof employmentInfo.kccLimit === 'number') worker.kccLimit = employmentInfo.kccLimit;
      if (employmentInfo.occupation) worker.occupation = employmentInfo.occupation;
    }
    
    // Update address information
    if (addressInfo) {
      if (!worker.address) {
        worker.address = {};
      }
      if (addressInfo.street) worker.address.street = addressInfo.street;
      if (addressInfo.city) worker.address.city = addressInfo.city;
      if (addressInfo.state) worker.address.state = addressInfo.state;
      if (addressInfo.postalCode) worker.address.pincode = addressInfo.postalCode;
      if (addressInfo.district) worker.address.district = addressInfo.district;
    }
    
    // Update bank details if provided (for primary account compatibility)
    if (bankDetails) {
      if (bankDetails.accountNumber) worker.bankAccount = bankDetails.accountNumber;
      if (bankDetails.bankName) worker.bankName = bankDetails.bankName;
      if (bankDetails.ifscCode) worker.ifscCode = bankDetails.ifscCode;
      if (bankDetails.upiId) worker.upiId = bankDetails.upiId;
    }
    
    await worker.save();
    
    // Also update user name if provided
    if (personalInfo?.firstName || personalInfo?.lastName) {
      await User.findByIdAndUpdate(worker.userId, { name: worker.name });
    }
    
    logger.info('Worker profile updated', { workerId: worker._id });
    
    // Return updated profile in formatted structure
    const updatedWorker = await Worker.findOne({ userId: req.user.id })
      .populate('userId', 'email role isActive lastLogin')
      .lean();
    
    const profileData = {
      _id: updatedWorker._id,
      personalInfo: {
        firstName: updatedWorker.name ? updatedWorker.name.split(' ')[0] : '',
        lastName: updatedWorker.name ? updatedWorker.name.split(' ').slice(1).join(' ') : '',
        dateOfBirth: updatedWorker.dateOfBirth,
        gender: updatedWorker.gender,
        phone: updatedWorker.phone,
        alternatePhone: updatedWorker.alternatePhone,
        email: updatedWorker.userId?.email || '',
        occupation: updatedWorker.occupation,
        skills: updatedWorker.skills || []
      },
      addressInfo: {
        street: updatedWorker.address?.street || '',
        city: updatedWorker.address?.city || '',
        state: updatedWorker.address?.state || '',
        postalCode: updatedWorker.address?.pincode || '',
        district: updatedWorker.address?.district || '',
        country: 'India'
      },
      bankAccounts: updatedWorker.bankAccounts || []
    };
    
    return successResponse(res, profileData, 'Profile updated successfully');
  } catch (error) {
    logger.error('Update my profile error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get current worker's income summary
 */
export const getMyIncomeSummary = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    // Get wage records
    const wageRecords = await WageRecord.find({
      workerId: worker._id,
      status: 'completed'
    }).sort({ createdAt: -1 });
    
    // Calculate statistics
    const totalIncome = wageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last30Days = wageRecords
      .filter(w => new Date(w.createdAt) >= thirtyDaysAgo)
      .reduce((sum, w) => sum + w.amount, 0);
    
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const annualIncome = wageRecords
      .filter(w => new Date(w.createdAt) >= yearStart)
      .reduce((sum, w) => sum + w.amount, 0);
    
    const transactionCount = wageRecords.length;
    const averageDailyWage = transactionCount > 0 
      ? Math.round(totalIncome / transactionCount) 
      : 0;
    
    // BPL threshold from env
    const bplThreshold = parseInt(process.env.BPL_THRESHOLD) || 120000;
    const classification = annualIncome < bplThreshold ? 'BPL' : 'APL';
    
    return successResponse(res, {
      totalIncome,
      last30Days,
      annualIncome,
      transactionCount,
      averageDailyWage,
      classification,
      bplThreshold,
      lastUpdated: new Date()
    });
  } catch (error) {
    logger.error('Get my income summary error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get current worker's transactions
 */
export const getMyTransactions = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    const { page = 1, limit = 100, startDate, endDate, status } = req.query;
    
    const query = { workerId: worker._id };
    
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const transactions = await WageRecord.find(query)
      .populate('employerId', 'companyName contactPerson')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Transform transactions with proper incomeSource and isVerified
    const transformedTransactions = transactions.map(t => ({
      _id: t._id,
      id: t._id,
      amount: t.amount,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      status: t.status,
      paymentMethod: t.paymentMethod,
      transactionType: t.transactionType,
      description: t.description,
      referenceNumber: t.referenceNumber,
      // Income source: employer name if available, else custom incomeSource field
      incomeSource: t.employerId?.companyName || t.incomeSource || 'Unknown Source',
      employerId: t.employerId,
      // Verified: employer payments are verified, self-declared are not
      isVerified: t.isVerified || (t.employerId && t.source === 'employer') || t.verifiedOnChain || false,
      verified: t.isVerified || (t.employerId && t.source === 'employer') || t.verifiedOnChain || false,
      blockchainTxId: t.blockchainTxId,
      blockNumber: t.blockNumber,
      workPeriod: t.workPeriod,
      source: t.source
    }));
    
    return successResponse(res, transformedTransactions, transactions.length);
  } catch (error) {
    logger.error('Get my transactions error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get current worker's bank accounts
 */
export const getMyBankAccounts = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    // Format accounts for response
    const formattedAccounts = (worker.bankAccounts || []).map(acc => ({
      _id: acc._id,
      accountNumber: acc.accountNumber,
      accountNumberMasked: `****${acc.accountNumber.slice(-4)}`,
      accountHolderName: acc.accountHolderName,
      bankName: acc.bankName,
      ifscCode: acc.ifscCode,
      country: acc.country || 'IN',
      accountType: acc.accountType,
      balance: acc.balance || 0,
      monthlyIncome: acc.monthlyIncome || 0,
      balanceLastUpdated: acc.balanceLastUpdated,
      isDefault: acc.isDefault,
      isVerified: acc.isVerified,
      blockchainMetadata: acc.blockchainMetadata,
      anomalyDetection: acc.anomalyDetection,
      createdAt: acc.createdAt
    }));
    
    const totalBalance = formattedAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const totalMonthlyIncome = formattedAccounts.reduce((sum, acc) => sum + (acc.monthlyIncome || 0), 0);
    
    return successResponse(res, {
      bankAccounts: formattedAccounts,
      defaultAccount: formattedAccounts.find(acc => acc.isDefault) || null,
      totalBalance,
      totalMonthlyIncome,
      accountCount: formattedAccounts.length
    });
  } catch (error) {
    logger.error('Get bank accounts error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Add a bank account to current worker
 */
export const addBankAccount = async (req, res) => {
  try {
    const { accountNumber, accountHolderName, bankName, ifscCode, country, accountType, isDefault } = req.body;
    
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    // Initialize bankAccounts array if not exists
    if (!worker.bankAccounts) {
      worker.bankAccounts = [];
    }
    
    // Check for duplicate account number
    const accountExists = worker.bankAccounts.some(acc => acc.accountNumber === accountNumber);
    if (accountExists) {
      return errorResponse(res, 'This bank account is already added', 409);
    }
    
    // If this is the first account or marked as default, set it as default
    const shouldBeDefault = isDefault || worker.bankAccounts.length === 0;
    
    // Remove default from other accounts if this should be default
    if (shouldBeDefault) {
      worker.bankAccounts.forEach(acc => acc.isDefault = false);
    }
    
    // Add new account with auto-linked workerIdHash
    // Balance starts at 0 - will be updated through deposits via QR code
    const newAccount = {
      workerIdHash: worker.idHash, // ✨ Auto-linked to Aadhaar
      accountNumber,
      accountHolderName,
      bankName,
      ifscCode,
      country: country || 'IN',
      accountType: accountType || 'savings',
      balance: 0, // Starts at 0
      balanceLastUpdated: new Date(),
      monthlyIncome: 0, // Starts at 0
      blockchainMetadata: {
        totalTransactionCount: 0,
        lastSyncedAt: null
      },
      aiFeatures: {
        unverified_rate: 0,
        weekend_pct: 0,
        night_hours_pct: 0,
        num_unique_sources: 0,
        income_cv: 0
      },
      anomalyDetection: {
        isAnomaly: false,
        anomalyProbability: 0
      },
      isDefault: shouldBeDefault,
      isVerified: false,
      createdAt: new Date()
    };
    
    worker.bankAccounts.push(newAccount);
    await worker.save();
    
    logger.info('Bank account added', { 
      workerId: worker._id, 
      workerIdHash: worker.idHash,
      account: accountNumber.slice(-4) 
    });
    
    return createdResponse(res, {
      account: worker.bankAccounts[worker.bankAccounts.length - 1]
    }, 'Bank account added successfully');
  } catch (error) {
    logger.error('Add bank account error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update a bank account
 */
export const updateBankAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { accountHolderName, bankName, ifscCode, accountType } = req.body;
    
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    const account = worker.bankAccounts?.id(accountId);
    if (!account) {
      return notFoundResponse(res, 'Bank account not found');
    }
    
    if (accountHolderName) account.accountHolderName = accountHolderName;
    if (bankName) account.bankName = bankName;
    if (ifscCode) account.ifscCode = ifscCode;
    if (accountType) account.accountType = accountType;
    
    await worker.save();
    
    logger.info('Bank account updated', { workerId: worker._id, accountId });
    
    return successResponse(res, { account }, 'Bank account updated successfully');
  } catch (error) {
    logger.error('Update bank account error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Delete a bank account
 */
export const deleteBankAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    const account = worker.bankAccounts?.id(accountId);
    if (!account) {
      return notFoundResponse(res, 'Bank account not found');
    }
    
    const wasDefault = account.isDefault;
    account.deleteOne();
    
    // If deleted account was default, set new default
    if (wasDefault && worker.bankAccounts.length > 0) {
      worker.bankAccounts[0].isDefault = true;
    }
    
    await worker.save();
    
    logger.info('Bank account deleted', { workerId: worker._id, accountId });
    
    return successResponse(res, null, 'Bank account deleted successfully');
  } catch (error) {
    logger.error('Delete bank account error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Set a bank account as default
 */
export const setDefaultBankAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }
    
    const account = worker.bankAccounts?.id(accountId);
    if (!account) {
      return notFoundResponse(res, 'Bank account not found');
    }
    
    // Remove default from all accounts
    worker.bankAccounts.forEach(acc => acc.isDefault = false);
    
    // Set new default
    account.isDefault = true;
    
    await worker.save();
    
    logger.info('Default bank account changed', { workerId: worker._id, accountId });
    
    return successResponse(res, { account }, 'Default bank account updated');
  } catch (error) {
    logger.error('Set default bank account error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Generate QR code for bank account
 */
export const generateQRForAccount = async (req, res) => {
  try {
    const { accountId } = req.body;
    const worker = await Worker.findOne({ userId: req.user.id });

    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }

    const account = worker.bankAccounts?.id(accountId);
    if (!account) {
      return notFoundResponse(res, 'Bank account not found');
    }

    // Create QR data object with bank account details
    const qrData = {
      type: 'payment',
      workerIdHash: worker.idHash,
      accountId: accountId,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolderName,
      bankName: account.bankName,
      ifscCode: account.ifscCode,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    // Create the QR code string (JSON format, base64 encoded)
    const qrContent = JSON.stringify(qrData);
    const qrToken = Buffer.from(qrContent).toString('base64');

    // Generate QR code image using external API
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrToken)}`;

    // Create verification URL for internal use
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/scan-qr?token=${qrToken}`;

    logger.info('QR code generated', {
      workerId: worker._id,
      accountId: accountId,
      accountNumber: account.accountNumber.slice(-4)
    });

    return successResponse(res, {
      token: qrToken,
      qrCodeUrl,
      verifyUrl,
      accountDetails: {
        accountNumber: `****${account.accountNumber.slice(-4)}`,
        accountHolder: account.accountHolderName,
        bankName: account.bankName,
        ifscCode: account.ifscCode
      },
      expiresAt: qrData.expiresAt
    }, 'QR code generated successfully');
  } catch (error) {
    logger.error('Generate QR error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Verify QR token and return recipient details
 */
export const verifyQRToken = async (req, res) => {
  try {
    let { token } = req.body;

    if (!token) {
      return errorResponse(res, 'QR token is required', 400);
    }

    token = token.trim();

    // Decode token
    let tokenData;
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      tokenData = JSON.parse(decoded);
    } catch (error) {
      return errorResponse(res, 'Invalid QR token format', 400);
    }

    const { workerIdHash, accountId, expiresAt } = tokenData;

    // Check expiry
    if (new Date() > new Date(expiresAt)) {
      return errorResponse(res, 'QR code has expired', 400);
    }

    // Find worker
    const worker = await Worker.findOne({ idHash: workerIdHash });
    if (!worker) {
      return errorResponse(res, 'Worker not registered', 404);
    }

    const account = worker.bankAccounts?.id(accountId);
    if (!account) {
      return errorResponse(res, 'Bank account not found', 404);
    }

    logger.info('QR code verified', {
      workerId: worker._id,
      accountNumber: account.accountNumber.slice(-4)
    });

    return successResponse(res, {
      workerHash: workerIdHash,
      accountId: accountId,
      bankName: account.bankName,
      accountHolderName: account.accountHolderName,
      accountNumberMasked: `****${account.accountNumber.slice(-4)}`,
      ifscCode: account.ifscCode,
      country: account.country,
      isValid: true,
      expiresAt: expiresAt
    }, 'QR code verified');

  } catch (error) {
    logger.error('Verify QR error:', error);
    return errorResponse(res, 'Failed to verify QR code', 500);
  }
};

/**
 * Simulate payment deposit via QR code
 */
export const depositViaQR = async (req, res) => {
  try {
    const { 
      token, 
      amount, 
      payerName = 'Anonymous',
      payerPhone,
      payerIdHash,
      payerAccountId 
    } = req.body;

    console.log('=== QR Deposit Request ===');
    console.log('Amount:', amount);
    console.log('Payer Name:', payerName);
    console.log('Payer ID Hash:', payerIdHash);
    console.log('Payer Account ID:', payerAccountId);

    if (!token || !amount) {
      return errorResponse(res, 'Token and amount are required', 400);
    }
    
    // Require sender account information
    if (!payerIdHash || !payerAccountId) {
      return errorResponse(res, 'Sender account information required. Please log in to make payments.', 401);
    }

    // Decode QR token
    let qrData;
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      qrData = JSON.parse(decoded);
    } catch (error) {
      return errorResponse(res, 'Invalid QR token format', 400);
    }

    const { workerIdHash, accountId } = qrData;

    // Find receiver (worker) and account
    const receiver = await Worker.findOne({ idHash: workerIdHash });
    if (!receiver) {
      return errorResponse(res, 'Receiver not found', 404);
    }

    const receiverAccount = receiver.bankAccounts?.id(accountId);
    if (!receiverAccount) {
      return errorResponse(res, 'Receiver bank account not found', 404);
    }

    // Check QR expiry
    const expiryTime = new Date(qrData.expiresAt);
    if (new Date() > expiryTime) {
      return errorResponse(res, 'QR code has expired', 400);
    }

    // Validate amount
    if (amount <= 0 || amount > 1000000) {
      return errorResponse(res, 'Invalid amount. Must be between 1 and 1000000', 400);
    }

    // Find sender (now required)
    const sender = await Worker.findOne({ idHash: payerIdHash });
    if (!sender) {
      return errorResponse(res, 'Sender account not found. Please log in again.', 404);
    }

    const senderAccount = sender.bankAccounts?.id(payerAccountId);
    if (!senderAccount) {
      return errorResponse(res, 'Sender bank account not found', 404);
    }
    
    const senderPreviousBalance = senderAccount.balance || 0;
    
    // Check sufficient funds
    if (senderPreviousBalance < amount) {
      return errorResponse(res, `Insufficient funds. Your balance: ₹${senderPreviousBalance.toFixed(2)}, Required: ₹${amount.toFixed(2)}`, 400);
    }
    
    // Deduct from sender
    senderAccount.balance = senderPreviousBalance - amount;
    senderAccount.balanceLastUpdated = new Date();
    
    // Update sender's total (reduce)
    sender.balance = (sender.balance || 0) - amount;
    
    await sender.save();
    
    logger.info('Debited sender account', {
      senderId: sender._id,
      amount: amount,
      newBalance: senderAccount.balance,
      previousBalance: senderPreviousBalance
    });

    // Update receiver balance
    const receiverPreviousBalance = receiverAccount.balance || 0;
    receiverAccount.balance = receiverPreviousBalance + amount;
    receiverAccount.balanceLastUpdated = new Date();

    // Update monthly income
    if (!receiverAccount.monthlyIncome) {
      receiverAccount.monthlyIncome = 0;
    }
    receiverAccount.monthlyIncome += amount;

    // Update receiver total earnings
    receiver.totalEarnings = (receiver.totalEarnings || 0) + amount;
    receiver.balance = (receiver.balance || 0) + amount;

    await receiver.save();

    // Create transaction record
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const transaction = await UPITransaction.create({
      txId: transactionId,
      workerId: receiver._id,
      workerHash: workerIdHash,
      workerName: receiver.name,
      workerAccount: receiverAccount.accountNumber,
      senderName: sender.name,
      senderPhone: payerPhone || sender.phone,
      senderAccount: senderAccount.accountNumber,
      amount: amount,
      status: 'completed',
      mode: 'QR_SCAN',
      timestamp: new Date(),
      completedAt: new Date()
    });

    // Log audit trail
    await AuditLog.log({
      action: 'payment_received',
      category: 'transaction',
      userId: receiver.userId,
      resourceType: 'Worker',
      resourceId: receiver._id,
      details: {
        amount: amount,
        transactionId: transactionId,
        paymentMethod: 'QR_SCAN',
        senderId: sender._id,
        senderBalance: senderAccount.balance
      }
    });

    logger.info('Payment via QR completed', {
      receiverId: receiver._id,
      senderId: sender._id,
      transactionId: transactionId,
      amount: amount,
      receiverAccount: receiverAccount.accountNumber.slice(-4)
    });

    return successResponse(res, {
      transactionId: transactionId,
      amount: amount,
      bankName: receiverAccount.bankName,
      accountHolderName: receiverAccount.accountHolderName,
      newBalance: receiverAccount.balance,
      previousBalance: receiverPreviousBalance,
      timestamp: new Date().toISOString(),
      accountNumber: `****${receiverAccount.accountNumber.slice(-4)}`,
      sender: {
        name: sender.name,
        debited: true,
        newBalance: senderAccount.balance,
        previousBalance: senderPreviousBalance
      }
    }, 'Payment successful');

  } catch (error) {
    console.error('=== QR Deposit Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    logger.error('Deposit via QR error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker dashboard data
 * Returns total earnings, monthly income, income by source, recent wages
 */
export const getMyDashboard = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id });
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    // Get all wage records for this worker
    const wageRecords = await WageRecord.find({
      workerId: worker._id,
      status: 'completed'
    }).populate('employerId', 'companyName').sort({ createdAt: -1 });

    // Calculate total earnings
    const totalEarnings = wageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // Calculate monthly average
    const uniqueMonths = new Set(wageRecords.map(w => {
      const d = new Date(w.createdAt);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    const monthlyAverage = uniqueMonths.size > 0 ? Math.round(totalEarnings / uniqueMonths.size) : 0;

    // Get last payment
    const lastPayment = wageRecords.length > 0 ? {
      amount: wageRecords[0].amount,
      date: wageRecords[0].createdAt,
      source: wageRecords[0].employerId?.companyName || wageRecords[0].incomeSource || 'Unknown'
    } : null;

    // Monthly income for the last 12 months
    const now = new Date();
    const monthlyIncome = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
      
      const monthTotal = wageRecords
        .filter(w => {
          const d = new Date(w.createdAt);
          return d >= monthDate && d <= monthEnd;
        })
        .reduce((sum, w) => sum + w.amount, 0);
      
      monthlyIncome.push({
        month: monthName,
        amount: monthTotal
      });
    }

    // Income by source
    const incomeBySource = {};
    wageRecords.forEach(w => {
      const source = w.employerId?.companyName || w.incomeSource || 'Other';
      incomeBySource[source] = (incomeBySource[source] || 0) + w.amount;
    });
    
    const incomeBySourceArray = Object.entries(incomeBySource).map(([source, amount]) => ({
      source,
      amount,
      percentage: Math.round((amount / totalEarnings) * 100)
    })).sort((a, b) => b.amount - a.amount);

    // Recent wages (last 10)
    const recentWages = wageRecords.slice(0, 10).map(w => ({
      id: w._id,
      amount: w.amount,
      date: w.createdAt,
      source: w.employerId?.companyName || w.incomeSource || 'Unknown',
      status: w.status,
      // Employer payments are verified, self-declared are not
      verified: w.isVerified || (w.employerId && w.source === 'employer') || w.verifiedOnChain || false,
      paymentMethod: w.paymentMethod
    }));

    // Verified vs unverified breakdown (based on isVerified field)
    const verifiedRecords = wageRecords.filter(w => w.isVerified || (w.employerId && w.source === 'employer') || w.verifiedOnChain);
    const verifiedTotal = verifiedRecords.reduce((sum, w) => sum + w.amount, 0);
    const unverifiedTotal = totalEarnings - verifiedTotal;

    return successResponse(res, {
      totalEarnings,
      monthlyAverage,
      lastPayment,
      monthlyIncome,
      incomeBySource: incomeBySourceArray,
      recentWages,
      verificationBreakdown: {
        verified: verifiedTotal,
        unverified: unverifiedTotal,
        verifiedPercentage: totalEarnings > 0 ? Math.round((verifiedTotal / totalEarnings) * 100) : 0
      },
      bankAccounts: worker.bankAccounts || [],
      lastUpdated: new Date()
    });
  } catch (error) {
    logger.error('Get my dashboard error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get worker welfare/BPL status
 * Returns BPL status, income breakdown with verified/unverified, eligible schemes
 */
export const getMyWelfareStatus = async (req, res) => {
  try {
    const worker = await Worker.findOne({ userId: req.user.id })
      .populate('enrolledSchemes.schemeId');
    
    if (!worker) {
      return notFoundResponse(res, 'Worker profile not found');
    }

    // Get wage records from the last 12 months
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const wageRecords = await WageRecord.find({
      workerId: worker._id,
      status: 'completed',
      createdAt: { $gte: oneYearAgo }
    }).populate('employerId', 'companyName').sort({ createdAt: -1 });

    // Calculate annual income
    const annualIncome = wageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // BPL threshold
    const threshold = parseInt(process.env.BPL_THRESHOLD) || 120000;
    const isBPL = annualIncome <= threshold;
    const status = isBPL ? 'BPL' : 'APL';

    // Income breakdown by source (verified vs unverified)
    const incomeBreakdown = [];
    const sourceMap = {};
    
    wageRecords.forEach(w => {
      const source = w.employerId?.companyName || w.incomeSource || 'Other';
      // Employer payments are verified, self-declared are not
      const isVerified = w.isVerified || (w.employerId && w.source === 'employer') || w.verifiedOnChain || false;
      const key = `${source}-${isVerified}`;
      
      if (!sourceMap[key]) {
        sourceMap[key] = {
          source,
          amount: 0,
          verified: isVerified
        };
      }
      sourceMap[key].amount += w.amount;
    });
    
    Object.values(sourceMap).forEach(item => {
      incomeBreakdown.push({
        source: item.source,
        amount: item.amount,
        percentage: Math.round((item.amount / annualIncome) * 100) || 0,
        verified: item.verified
      });
    });
    
    // Sort by amount
    incomeBreakdown.sort((a, b) => b.amount - a.amount);

    // Verification statistics
    const verifiedRecords = wageRecords.filter(w => w.isVerified || (w.employerId && w.source === 'employer') || w.verifiedOnChain);
    const unverifiedRecords = wageRecords.filter(w => !(w.isVerified || (w.employerId && w.source === 'employer') || w.verifiedOnChain));
    
    const verifiedAmount = verifiedRecords.reduce((sum, w) => sum + w.amount, 0);
    const unverifiedAmount = unverifiedRecords.reduce((sum, w) => sum + w.amount, 0);

    // Verification history (last 5 verifications)
    const verificationHistory = wageRecords
      .filter(w => w.verifiedOnChain)
      .slice(0, 5)
      .map(w => ({
        date: w.createdAt,
        source: w.employerId?.companyName || w.incomeSource || 'Employer',
        amount: w.amount,
        transactionId: w.blockchainTxId || w.referenceNumber
      }));

    // Eligible schemes based on BPL status
    const eligibleSchemes = isBPL ? [
      {
        id: 'pds',
        name: 'Public Distribution System (PDS)',
        description: 'Subsidized food grains distribution',
        benefits: 'Rice at ₹3/kg, Wheat at ₹2/kg',
        eligibility: 'BPL families'
      },
      {
        id: 'pmay',
        name: 'Pradhan Mantri Awas Yojana',
        description: 'Housing scheme for economically weaker sections',
        benefits: 'Up to ₹2.67 lakhs subsidy',
        eligibility: 'Annual income below ₹3 lakhs'
      },
      {
        id: 'ayushman',
        name: 'Ayushman Bharat',
        description: 'Health insurance scheme',
        benefits: 'Up to ₹5 lakhs coverage per family',
        eligibility: 'BPL and vulnerable families'
      },
      {
        id: 'mgnrega',
        name: 'MGNREGA',
        description: 'Employment guarantee scheme',
        benefits: '100 days of guaranteed wage employment',
        eligibility: 'Rural households'
      },
      {
        id: 'nfsa',
        name: 'National Food Security Act',
        description: 'Food security for priority households',
        benefits: '5 kg of foodgrains per person per month',
        eligibility: 'BPL families'
      }
    ] : [
      {
        id: 'pmjjby',
        name: 'PM Jeevan Jyoti Bima Yojana',
        description: 'Life insurance scheme',
        benefits: '₹2 lakh life cover at ₹330/year',
        eligibility: 'All citizens aged 18-50'
      }
    ];

    // Amount needed to maintain BPL status
    const amountFromThreshold = threshold - annualIncome;

    return successResponse(res, {
      status,
      isBPL,
      annualIncome,
      threshold,
      amountFromThreshold,
      incomeBreakdown,
      verification: {
        verifiedAmount,
        unverifiedAmount,
        verifiedPercentage: annualIncome > 0 ? Math.round((verifiedAmount / annualIncome) * 100) : 0,
        verifiedTransactions: verifiedRecords.length,
        unverifiedTransactions: unverifiedRecords.length
      },
      verificationHistory,
      eligibleSchemes,
      enrolledSchemes: worker.enrolledSchemes || [],
      lastClassificationDate: worker.lastClassificationDate,
      bankAccountBalance: worker.bankAccounts?.[0]?.balance || 0,
      lastUpdated: new Date()
    });
  } catch (error) {
    logger.error('Get my welfare status error:', error);
    return errorResponse(res, error.message, 500);
  }
};

export default {
  createWorker,
  getWorkers,
  getWorkerById,
  getWorkerByIdHash,
  updateWorker,
  verifyWorker,
  getWorkerIncomeSummary,
  getWorkerTransactions,
  getBPLWorkers,
  deleteWorker,
  getMyProfile,
  updateMyProfile,
  getMyIncomeSummary,
  getMyTransactions,
  getMyBankAccounts,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  generateQRForAccount,
  verifyQRToken,
  depositViaQR,
  getMyDashboard,
  getMyWelfareStatus
};
