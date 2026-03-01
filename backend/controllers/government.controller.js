/**
 * Government Controller
 */
import { Worker, Employer, WageRecord, AnomalyAlert, WelfareScheme, AuditLog, ClassificationOverride, PolicyConfig, SystemMetadata } from '../models/index.js';
import { successResponse, errorResponse, notFoundResponse, paginatedResponse } from '../utils/response.util.js';
import { paginateQuery, paginateAggregate } from '../utils/pagination.util.js';
import { calculateBPLStatus } from '../utils/bpl.util.js';
import { sendVerificationEmail, sendSchemeNotification } from '../services/email.service.js';
import { recordVerification } from '../services/fabric.service.js';
import { logger } from '../utils/logger.util.js';
import { VERIFICATION_STATUS, INCOME_CATEGORIES } from '../config/constants.js';
import * as policyScreeningService from '../services/policyScreening.service.js';

// ============================================================================
// Eligibility Evaluation Helper
// ============================================================================

/**
 * Evaluate all active workers against all active schemes and update:
 *  - Worker.eligibleSchemes (list of scheme codes the worker qualifies for)
 *  - WelfareScheme.currentBeneficiaries (count of eligible workers per scheme)
 *
 * Called after scheme create / update / delete.
 */
const evaluateEligibilityForAllSchemes = async () => {
  try {
    const activeSchemes = await WelfareScheme.find({ status: 'active' });
    const workers = await Worker.find({ isActive: true });

    // Map: schemeId -> count of eligible workers
    const beneficiaryCounts = {};
    activeSchemes.forEach(s => { beneficiaryCounts[s._id.toString()] = 0; });

    // Bulk ops arrays
    const workerBulkOps = [];

    for (const worker of workers) {
      const eligibleCodes = [];

      for (const scheme of activeSchemes) {
        const result = scheme.checkEligibility(worker);
        if (result.eligible) {
          eligibleCodes.push(scheme.code);
          beneficiaryCounts[scheme._id.toString()]++;
        }
      }

      // Only write if the list actually changed
      const currentCodes = (worker.eligibleSchemes || []).slice().sort();
      const newCodes = eligibleCodes.slice().sort();
      if (JSON.stringify(currentCodes) !== JSON.stringify(newCodes)) {
        workerBulkOps.push({
          updateOne: {
            filter: { _id: worker._id },
            update: { $set: { eligibleSchemes: eligibleCodes } }
          }
        });
      }
    }

    // Bulk update workers
    if (workerBulkOps.length > 0) {
      await Worker.bulkWrite(workerBulkOps);
    }

    // Bulk update beneficiary counts on schemes
    const schemeBulkOps = activeSchemes.map(s => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { currentBeneficiaries: beneficiaryCounts[s._id.toString()] } }
      }
    }));
    if (schemeBulkOps.length > 0) {
      await WelfareScheme.bulkWrite(schemeBulkOps);
    }

    // Also clear eligibility for any closed/deleted schemes that may still be on workers
    // (handled by the fact that we only matched active schemes above)

    logger.info(`Eligibility evaluation complete: ${workers.length} workers across ${activeSchemes.length} active schemes, ${workerBulkOps.length} workers updated`);

    return { workersEvaluated: workers.length, schemesEvaluated: activeSchemes.length, workersUpdated: workerBulkOps.length };
  } catch (error) {
    logger.error('Eligibility evaluation error:', error);
    throw error;
  }
};

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalWorkers,
      verifiedWorkers,
      pendingVerifications,
      bplWorkers,
      totalTransactions,
      pendingAnomalies
    ] = await Promise.all([
      Worker.countDocuments({ isActive: true }),
      Worker.countDocuments({ verificationStatus: VERIFICATION_STATUS.VERIFIED }),
      Worker.countDocuments({ verificationStatus: VERIFICATION_STATUS.PENDING }),
      Worker.countDocuments({ incomeCategory: INCOME_CATEGORIES.BPL }),
      WageRecord.countDocuments({ status: 'completed' }),
      AnomalyAlert.countDocuments({ status: { $in: ['pending', 'investigating'] } })
    ]);
    
    // Get recent transaction volume
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const transactionVolume = await WageRecord.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    
    return successResponse(res, {
      workers: {
        total: totalWorkers,
        verified: verifiedWorkers,
        pendingVerification: pendingVerifications,
        bpl: bplWorkers,
        apl: totalWorkers - bplWorkers
      },
      transactions: {
        total: totalTransactions,
        last30Days: {
          count: transactionVolume[0]?.count || 0,
          volume: transactionVolume[0]?.total || 0
        }
      },
      alerts: {
        pending: pendingAnomalies
      }
    });
    
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get pending verifications
 */
export const getPendingVerifications = async (req, res) => {
  try {
    const { type } = req.query; // 'worker' or 'employer'
    
    let Model = Worker;
    if (type === 'employer') {
      Model = Employer;
    }
    
    const { data, pagination } = await paginateQuery(
      Model,
      { verificationStatus: VERIFICATION_STATUS.PENDING },
      {
        ...req.query,
        defaultSort: 'createdAt'
      }
    );
    
    return paginatedResponse(res, data, pagination);
    
  } catch (error) {
    logger.error('Get pending verifications error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Verify entity (worker or employer)
 */
export const verifyEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { status, notes } = req.body;
    
    let Model = Worker;
    if (entityType === 'employer') {
      Model = Employer;
    }
    
    const entity = await Model.findById(entityId);
    
    if (!entity) {
      return notFoundResponse(res, `${entityType} not found`);
    }
    
    entity.verificationStatus = status;
    entity.verifiedBy = req.user.id;
    entity.verifiedAt = new Date();
    entity.verificationNotes = notes;
    
    await entity.save();
    
    // Record on blockchain
    await recordVerification({
      entityType,
      entityId,
      verifiedBy: req.user.id,
      status
    });
    
    // Log
    AuditLog.logVerification(`${entityType}_verified`, req.user.id, entityType, entityId, {
      newValue: { status, notes }
    });
    
    // Send notification email
    if (entity.email) {
      sendVerificationEmail({ name: entity.name, email: entity.email }, status, notes);
    }
    
    logger.info(`${entityType} verified`, { entityId, status, verifiedBy: req.user.id });
    
    return successResponse(res, entity, `${entityType} ${status}`);
    
  } catch (error) {
    logger.error('Verify entity error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get BPL/APL distribution
 */
export const getIncomeDistribution = async (req, res) => {
  try {
    const { state, district } = req.query;
    
    const matchStage = { isActive: true, verificationStatus: VERIFICATION_STATUS.VERIFIED };
    
    if (state) matchStage['address.state'] = state;
    if (district) matchStage['address.district'] = district;
    
    const distribution = await Worker.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$incomeCategory',
          count: { $sum: 1 },
          avgIncome: { $avg: '$annualIncome' }
        }
      }
    ]);
    
    const byState = await Worker.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { state: '$address.state', category: '$incomeCategory' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.state',
          categories: {
            $push: { category: '$_id.category', count: '$count' }
          },
          total: { $sum: '$count' }
        }
      },
      { $sort: { total: -1 } }
    ]);
    
    return successResponse(res, {
      overall: distribution.reduce((acc, d) => {
        acc[d._id] = { count: d.count, avgIncome: Math.round(d.avgIncome) };
        return acc;
      }, {}),
      byState
    });
    
  } catch (error) {
    logger.error('Get income distribution error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get anomaly alerts
 */
export const getAnomalyAlerts = async (req, res) => {
  try {
    const { status, severity, alertType } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (alertType) query.alertType = alertType;
    
    const { data, pagination } = await paginateQuery(
      AnomalyAlert,
      query,
      {
        ...req.query,
        populate: [
          { path: 'workerId', select: 'name idHash' },
          { path: 'assignedTo', select: 'name designation' }
        ],
        defaultSort: '-severity -detectedAt'
      }
    );
    
    return paginatedResponse(res, data, pagination);
    
  } catch (error) {
    logger.error('Get anomaly alerts error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Resolve anomaly alert
 */
export const resolveAnomaly = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, followUpRequired, followUpDate } = req.body;
    
    const alert = await AnomalyAlert.findById(id);
    
    if (!alert) {
      return notFoundResponse(res, 'Alert not found');
    }
    
    await alert.resolve(req.user.id, {
      action,
      notes,
      followUpRequired,
      followUpDate
    });
    
    logger.info('Anomaly resolved', { alertId: id, action, resolvedBy: req.user.id });
    
    return successResponse(res, alert, 'Alert resolved');
    
  } catch (error) {
    logger.error('Resolve anomaly error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get welfare schemes
 */
export const getWelfareSchemes = async (req, res) => {
  try {
    const { category, status } = req.query;
    
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    
    const schemes = await WelfareScheme.find(query).sort({ name: 1 });
    
    return successResponse(res, schemes);
    
  } catch (error) {
    logger.error('Get welfare schemes error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Check worker eligibility for schemes
 */
export const checkSchemeEligibility = async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const worker = await Worker.findById(workerId);
    
    if (!worker) {
      return notFoundResponse(res, 'Worker not found');
    }
    
    const activeSchemes = await WelfareScheme.find({ status: 'active' });
    
    const eligibility = activeSchemes.map(scheme => ({
      scheme: {
        id: scheme._id,
        name: scheme.name,
        code: scheme.code,
        category: scheme.category,
        benefits: scheme.benefits
      },
      ...scheme.checkEligibility(worker)
    }));
    
    const eligibleSchemes = eligibility.filter(e => e.eligible);
    
    // Update worker's eligible schemes
    worker.eligibleSchemes = eligibleSchemes.map(e => e.scheme.code);
    await worker.save();
    
    return successResponse(res, {
      worker: {
        id: worker._id,
        name: worker.name,
        incomeCategory: worker.incomeCategory,
        annualIncome: worker.annualIncome
      },
      eligibility,
      eligibleCount: eligibleSchemes.length
    });
    
  } catch (error) {
    logger.error('Check scheme eligibility error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Create a new welfare scheme
 */
export const createWelfareScheme = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      category,
      eligibilityCriteria,
      benefits,
      totalBudget,
      allocatedBudget,
      maxBeneficiaries,
      startDate,
      endDate,
      enrollmentStartDate,
      enrollmentEndDate,
      status,
      requiredDocuments,
      ministry,
      department,
      implementingAgency,
      helplineNumber,
      email,
      website
    } = req.body;

    // Check if code already exists
    const existing = await WelfareScheme.findOne({ code: code?.toUpperCase() });
    if (existing) {
      return errorResponse(res, 'Scheme code already exists', 400);
    }

    const scheme = new WelfareScheme({
      name,
      code: code?.toUpperCase(),
      description,
      category,
      eligibilityCriteria: {
        incomeCategory: eligibilityCriteria?.incomeCategory || 'BPL',
        maxAnnualIncome: eligibilityCriteria?.maxAnnualIncome,
        minAge: eligibilityCriteria?.minAge,
        maxAge: eligibilityCriteria?.maxAge,
        gender: eligibilityCriteria?.gender || 'all',
        occupations: eligibilityCriteria?.occupations || [],
        states: eligibilityCriteria?.states || [],
        districts: eligibilityCriteria?.districts || [],
        customCriteria: eligibilityCriteria?.customCriteria
      },
      benefits: {
        type: benefits?.type || 'cash',
        amount: benefits?.amount || 0,
        frequency: benefits?.frequency || 'monthly',
        description: benefits?.description || ''
      },
      totalBudget: totalBudget || 0,
      allocatedBudget: allocatedBudget || totalBudget || 0,
      maxBeneficiaries,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      enrollmentStartDate: enrollmentStartDate ? new Date(enrollmentStartDate) : null,
      enrollmentEndDate: enrollmentEndDate ? new Date(enrollmentEndDate) : null,
      status: status || 'draft',
      requiredDocuments: requiredDocuments || [],
      ministry,
      department,
      implementingAgency,
      helplineNumber,
      email,
      website,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await scheme.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'welfare_scheme_created',
      category: 'scheme',
      resourceType: 'welfare_scheme',
      resourceId: scheme._id,
      resourceName: scheme.name,
      description: `Created welfare scheme: ${scheme.name} (${scheme.code})`,
      metadata: {
        schemeCode: scheme.code,
        category: scheme.category,
        incomeCategory: scheme.eligibilityCriteria.incomeCategory,
        status: scheme.status
      },
      success: true
    });

    logger.info(`Welfare scheme created: ${scheme.code} by user ${req.user._id}`);

    // Evaluate eligibility for all workers against all active schemes
    let eligibilityResult = null;
    try {
      eligibilityResult = await evaluateEligibilityForAllSchemes();
      logger.info(`Post-create eligibility evaluation: ${eligibilityResult.workersUpdated} workers updated`);
    } catch (evalErr) {
      logger.error('Non-fatal: eligibility evaluation failed after scheme creation:', evalErr);
    }

    // Reload scheme to get updated beneficiary count
    const updatedScheme = await WelfareScheme.findById(scheme._id);

    return successResponse(res, {
      ...updatedScheme.toJSON(),
      eligibilityResult
    }, 'Welfare scheme created successfully', 201);

  } catch (error) {
    logger.error('Create welfare scheme error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update an existing welfare scheme
 */
export const updateWelfareScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const scheme = await WelfareScheme.findById(id);

    if (!scheme) {
      return notFoundResponse(res, 'Welfare scheme not found');
    }

    // Update allowed fields
    const allowedFields = [
      'name', 'description', 'category', 'status',
      'totalBudget', 'allocatedBudget', 'maxBeneficiaries',
      'startDate', 'endDate', 'enrollmentStartDate', 'enrollmentEndDate',
      'requiredDocuments', 'ministry', 'department', 'implementingAgency',
      'helplineNumber', 'email', 'website'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (['startDate', 'endDate', 'enrollmentStartDate', 'enrollmentEndDate'].includes(field)) {
          scheme[field] = updates[field] ? new Date(updates[field]) : null;
        } else {
          scheme[field] = updates[field];
        }
      }
    });

    // Update nested fields
    if (updates.eligibilityCriteria) {
      scheme.eligibilityCriteria = {
        ...scheme.eligibilityCriteria?.toObject?.() || scheme.eligibilityCriteria,
        ...updates.eligibilityCriteria
      };
    }

    if (updates.benefits) {
      scheme.benefits = {
        ...scheme.benefits?.toObject?.() || scheme.benefits,
        ...updates.benefits
      };
    }

    scheme.lastModifiedBy = req.user._id;

    await scheme.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'welfare_scheme_updated',
      category: 'scheme',
      resourceType: 'welfare_scheme',
      resourceId: scheme._id,
      resourceName: scheme.name,
      description: `Updated welfare scheme: ${scheme.name} (${scheme.code})`,
      metadata: {
        schemeCode: scheme.code,
        updatedFields: Object.keys(updates)
      },
      success: true
    });

    logger.info(`Welfare scheme updated: ${scheme.code} by user ${req.user._id}`);

    // Re-evaluate eligibility for all workers against all active schemes
    let eligibilityResult = null;
    try {
      eligibilityResult = await evaluateEligibilityForAllSchemes();
      logger.info(`Post-update eligibility evaluation: ${eligibilityResult.workersUpdated} workers updated`);
    } catch (evalErr) {
      logger.error('Non-fatal: eligibility evaluation failed after scheme update:', evalErr);
    }

    // Reload scheme to get updated beneficiary count
    const updatedScheme = await WelfareScheme.findById(scheme._id);

    return successResponse(res, {
      ...updatedScheme.toJSON(),
      eligibilityResult
    }, 'Welfare scheme updated successfully');

  } catch (error) {
    logger.error('Update welfare scheme error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Delete a welfare scheme
 */
export const deleteWelfareScheme = async (req, res) => {
  try {
    const { id } = req.params;
    // Support hardDelete from body or query param
    const hardDelete = req.body?.hardDelete === true || req.query?.hardDelete === 'true';

    const scheme = await WelfareScheme.findById(id);

    if (!scheme) {
      return notFoundResponse(res, 'Welfare scheme not found');
    }

    if (hardDelete === true) {
      await WelfareScheme.deleteOne({ _id: id });

      await AuditLog.create({
        userId: req.user._id,
        action: 'welfare_scheme_deleted',
        category: 'scheme',
        resourceType: 'welfare_scheme',
        resourceId: scheme._id,
        resourceName: scheme.name,
        description: `Permanently deleted welfare scheme: ${scheme.name} (${scheme.code})`,
        metadata: { schemeCode: scheme.code },
        success: true
      });

      logger.info(`Welfare scheme permanently deleted: ${scheme.code} by user ${req.user._id}`);

      // Re-evaluate: remove scheme from workers' eligibleSchemes
      try {
        await evaluateEligibilityForAllSchemes();
      } catch (evalErr) {
        logger.error('Non-fatal: eligibility evaluation failed after scheme deletion:', evalErr);
      }

      return successResponse(res, null, 'Welfare scheme permanently deleted');
    }

    // Soft delete - set status to closed
    scheme.status = 'closed';
    scheme.lastModifiedBy = req.user._id;
    await scheme.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'welfare_scheme_closed',
      category: 'scheme',
      resourceType: 'welfare_scheme',
      resourceId: scheme._id,
      resourceName: scheme.name,
      description: `Closed welfare scheme: ${scheme.name} (${scheme.code})`,
      metadata: { schemeCode: scheme.code },
      success: true
    });

    logger.info(`Welfare scheme closed: ${scheme.code} by user ${req.user._id}`);

    // Re-evaluate: closed scheme should no longer qualify workers
    try {
      await evaluateEligibilityForAllSchemes();
    } catch (evalErr) {
      logger.error('Non-fatal: eligibility evaluation failed after scheme closure:', evalErr);
    }

    // Reload to get updated beneficiary count
    const updatedScheme = await WelfareScheme.findById(scheme._id);

    return successResponse(res, updatedScheme, 'Welfare scheme closed successfully');

  } catch (error) {
    logger.error('Delete welfare scheme error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Generate reports
 */
export const generateReport = async (req, res) => {
  try {
    const { reportType, startDate, endDate, state, district } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    let reportData = {};
    
    switch (reportType) {
      case 'bpl_summary':
        const bplMatch = { 
          isActive: true, 
          verificationStatus: VERIFICATION_STATUS.VERIFIED 
        };
        if (state) bplMatch['address.state'] = state;
        if (district) bplMatch['address.district'] = district;
        
        reportData = await Worker.aggregate([
          { $match: bplMatch },
          {
            $group: {
              _id: '$incomeCategory',
              count: { $sum: 1 },
              avgIncome: { $avg: '$annualIncome' },
              totalIncome: { $sum: '$annualIncome' }
            }
          }
        ]);
        break;
        
      case 'transaction_summary':
        const txMatch = { status: 'completed' };
        if (Object.keys(dateFilter).length) txMatch.createdAt = dateFilter;
        
        reportData = await WageRecord.aggregate([
          { $match: txMatch },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        break;
        
      case 'anomaly_summary':
        const anomalyMatch = {};
        if (Object.keys(dateFilter).length) anomalyMatch.detectedAt = dateFilter;
        
        reportData = await AnomalyAlert.aggregate([
          { $match: anomalyMatch },
          {
            $group: {
              _id: { type: '$alertType', status: '$status' },
              count: { $sum: 1 }
            }
          }
        ]);
        break;
        
      default:
        return errorResponse(res, 'Invalid report type', 400);
    }
    
    return successResponse(res, {
      reportType,
      generatedAt: new Date(),
      filters: { startDate, endDate, state, district },
      data: reportData
    });
    
  } catch (error) {
    logger.error('Generate report error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Run anomaly detection scan on workers
 * Triggers AI-based anomaly detection for specified workers or all workers
 */
export const runAnomalyScan = async (req, res) => {
  try {
    const { workerIds, startDate, endDate, limit = 100 } = req.body;
    
    // Build query for workers to scan
    const workerQuery = { isActive: true };
    if (workerIds && workerIds.length > 0) {
      workerQuery._id = { $in: workerIds };
    }
    
    // Get workers to scan
    const workers = await Worker.find(workerQuery)
      .limit(limit)
      .select('_id name sector annualIncome primaryEmployer createdAt')
      .lean();
    
    if (workers.length === 0) {
      return successResponse(res, {
        message: 'No workers found to scan',
        totalScanned: 0,
        anomaliesFound: 0,
        newAlerts: []
      });
    }
    
    // Build date filter for wage records
    const wageQuery = { status: 'completed' };
    if (startDate || endDate) {
      wageQuery.createdAt = {};
      if (startDate) wageQuery.createdAt.$gte = new Date(startDate);
      if (endDate) wageQuery.createdAt.$lte = new Date(endDate);
    }
    
    // Prepare worker data for batch anomaly detection
    const workersData = [];
    
    for (const worker of workers) {
      // Get worker's wage records for pattern analysis
      const wageRecords = await WageRecord.find({
        workerId: worker._id,
        ...wageQuery
      })
        .sort({ createdAt: -1 })
        .limit(24)
        .select('amount createdAt paymentMode verificationStatus employer isVerified')
        .lean();
      
      if (wageRecords.length < 2) continue; // Need at least 2 records for pattern analysis
      
      // Calculate pattern features
      const amounts = wageRecords.map(w => w.amount);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      const std = Math.sqrt(variance);
      const cv = mean > 0 ? std / mean : 0;
      
      // Month-over-month changes
      const momChanges = [];
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i] > 0) {
          momChanges.push((amounts[i - 1] - amounts[i]) / amounts[i]);
        }
      }
      const maxMomIncrease = momChanges.length > 0 ? Math.max(...momChanges) : 0;
      const maxDeviation = mean > 0 ? Math.max(...amounts.map(a => Math.abs(a - mean) / mean)) : 0;
      
      // Calculate timing patterns
      const weekendCount = wageRecords.filter(w => {
        const day = new Date(w.createdAt).getDay();
        return day === 0 || day === 6;
      }).length;
      const weekendPct = wageRecords.length > 0 ? weekendCount / wageRecords.length : 0;
      
      // Verification patterns - check both isVerified and verificationStatus
      const unverifiedCount = wageRecords.filter(w => 
        !w.isVerified && w.verificationStatus !== 'blockchain_verified' && w.verificationStatus !== 'verified'
      ).length;
      const unverifiedRate = wageRecords.length > 0 ? unverifiedCount / wageRecords.length : 0;
      
      // Unique employers (sources)
      const uniqueEmployers = new Set(wageRecords.map(w => w.employer?.toString())).size;
      
      // Calculate round amount percentage
      const roundAmounts = wageRecords.filter(w => w.amount % 1000 === 0 || w.amount % 5000 === 0).length;
      const roundAmountPct = wageRecords.length > 0 ? roundAmounts / wageRecords.length : 0;
      
      // Calculate cash deposit rate
      const cashDeposits = wageRecords.filter(w => w.paymentMode === 'cash_deposit').length;
      const cashDepositRate = wageRecords.length > 0 ? cashDeposits / wageRecords.length : 0;
      
      workersData.push({
        worker_id: worker._id.toString(),
        worker_data: {
          sector: worker.sector || 'other',
          is_formal: worker.sector === 'govt_employee' || worker.sector === 'it_services' ? 1 : 0,
          income_tier: worker.annualIncome > 500000 ? 'high' : worker.annualIncome > 100000 ? 'medium' : 'low',
          account_age_months: Math.floor((Date.now() - new Date(worker.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000))
        },
        pattern_data: {
          avg_tx_per_month: wageRecords.length,
          weekend_pct: weekendPct,
          night_hours_pct: 0.05, // Default - would need timestamp analysis
          round_amount_pct: roundAmountPct,
          near_50k_pct: wageRecords.filter(w => w.amount >= 45000 && w.amount < 50000).length / wageRecords.length,
          num_unique_sources: uniqueEmployers,
          source_concentration: uniqueEmployers > 0 ? 1 / uniqueEmployers : 1,
          unverified_rate: unverifiedRate,
          velocity_change: 1.0,
          burst_ratio: wageRecords.length > 0 ? Math.max(...amounts) / mean : 1,
          cash_deposit_rate: cashDepositRate
        },
        income_data: {
          income_cv: cv,
          max_mom_increase: maxMomIncrease,
          max_deviation_from_mean: maxDeviation,
          monthly_incomes: amounts
        }
      });
    }
    
    if (workersData.length === 0) {
      return successResponse(res, {
        message: 'No workers with sufficient wage data to scan',
        totalScanned: 0,
        anomaliesFound: 0,
        newAlerts: []
      });
    }
    
    // Import AI service and run batch detection
    const { batchDetectAnomalies } = await import('../services/ai.service.js');
    const scanResult = await batchDetectAnomalies(workersData);
    
    if (!scanResult.success) {
      return errorResponse(res, scanResult.error || 'Anomaly scan failed', 500);
    }
    
    // Create anomaly alerts for detected anomalies
    const newAlerts = [];
    for (const result of scanResult.results) {
      if (result.is_anomaly) {
        // Check if alert already exists for this worker
        const existingAlert = await AnomalyAlert.findOne({
          entityId: result.worker_id,
          entityType: 'worker',
          status: { $in: ['pending', 'investigating'] }
        });
        
        if (!existingAlert) {
          const alert = await AnomalyAlert.create({
            alertType: result.anomaly_types?.[0] || 'unusual_pattern',
            severity: result.severity || 'medium',
            entityType: 'worker',
            entityId: result.worker_id,
            workerId: result.worker_id,
            detectionMethod: scanResult.detectionMethod === 'ml_and_rules' ? 'ai_model' : 'rule_based',
            confidence: result.anomaly_score || 50,
            status: 'pending',
            title: `Anomaly Detected: ${result.anomaly_types?.[0] || 'unusual_pattern'}`,
            description: `AI anomaly scan detected suspicious patterns: ${result.anomaly_types?.join(', ') || 'unknown'}`,
            metadata: {
              anomalyScore: result.anomaly_score,
              anomalyTypes: result.anomaly_types,
              scanDate: new Date()
            }
          });
          newAlerts.push(alert);
        }
      }
    }
    
    // Log the scan
    await AuditLog.create({
      userId: req.user._id,
      action: 'anomaly_scan',
      category: 'system',
      resourceType: 'anomaly_scan',
      description: `Anomaly scan completed: ${scanResult.totalScanned} workers scanned, ${scanResult.anomaliesFound} anomalies found`,
      metadata: {
        totalScanned: scanResult.totalScanned,
        anomaliesFound: scanResult.anomaliesFound,
        newAlertsCreated: newAlerts.length,
        detectionMethod: scanResult.detectionMethod
      },
      success: true
    });
    
    logger.info(`Anomaly scan completed: ${scanResult.totalScanned} scanned, ${scanResult.anomaliesFound} anomalies, ${newAlerts.length} new alerts`);
    
    return successResponse(res, {
      message: 'Anomaly scan completed successfully',
      totalScanned: scanResult.totalScanned,
      anomaliesFound: scanResult.anomaliesFound,
      newAlertsCreated: newAlerts.length,
      detectionMethod: scanResult.detectionMethod,
      newAlerts: newAlerts.map(a => ({
        id: a._id,
        alertType: a.alertType,
        severity: a.severity,
        entityId: a.entityId,
        confidence: a.confidence
      }))
    });
    
  } catch (error) {
    logger.error('Run anomaly scan error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================================================
// CLASSIFICATION POLICY MANAGEMENT
// ============================================================================

/**
 * Get all classification override policies
 */
export const getClassificationPolicies = async (req, res) => {
  try {
    const { isActive, policyType } = req.query;
    
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (policyType) {
      query.policyType = policyType;
    }
    
    const policies = await ClassificationOverride.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .populate('createdBy', 'name designation')
      .populate('lastModifiedBy', 'name designation');
    
    // Get policy application status
    const applicationStatus = await policyScreeningService.getPolicyApplicationStatus();
    
    return successResponse(res, {
      policies,
      applicationStatus
    });
    
  } catch (error) {
    logger.error('Get classification policies error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get a single classification policy by ID
 */
export const getClassificationPolicy = async (req, res) => {
  try {
    const { policyId } = req.params;
    
    const policy = await ClassificationOverride.findOne({ policyId })
      .populate('createdBy', 'name designation')
      .populate('lastModifiedBy', 'name designation');
    
    if (!policy) {
      return notFoundResponse(res, 'Policy not found');
    }
    
    return successResponse(res, policy);
    
  } catch (error) {
    logger.error('Get classification policy error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Create a new classification override policy
 */
export const createClassificationPolicy = async (req, res) => {
  try {
    const {
      policyId,
      name,
      description,
      policyType,
      rules,
      ruleLogic,
      action,
      targetCriteria,
      priority,
      effectiveFrom,
      effectiveUntil
    } = req.body;
    
    // Check if policyId already exists
    const existing = await ClassificationOverride.findOne({ policyId });
    if (existing) {
      return errorResponse(res, 'Policy ID already exists', 400);
    }
    
    const policy = new ClassificationOverride({
      policyId,
      name,
      description,
      policyType,
      rules,
      ruleLogic: ruleLogic || 'AND',
      action,
      targetCriteria,
      priority: priority || 0,
      isActive: true,
      effectiveFrom: effectiveFrom || new Date(),
      effectiveUntil,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id,
      modificationHistory: [{
        action: 'created',
        modifiedBy: req.user._id,
        modifiedAt: new Date(),
        reason: 'Policy created'
      }]
    });
    
    await policy.save();
    
    // Mark that policies have been modified
    await policyScreeningService.markPoliciesModified();
    
    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'policy_created',
      category: 'policy',
      resourceType: 'classification_policy',
      resourceId: policy._id,
      resourceName: policy.name,
      description: `Created classification policy: ${policy.name}`,
      metadata: {
        policyId: policy.policyId,
        name: policy.name,
        policyType: policy.policyType,
        action: policy.action
      },
      success: true
    });
    
    logger.info(`Classification policy created: ${policyId} by user ${req.user._id}`);
    
    return successResponse(res, policy, 'Policy created successfully', 201);
    
  } catch (error) {
    logger.error('Create classification policy error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update an existing classification override policy
 */
export const updateClassificationPolicy = async (req, res) => {
  try {
    const { policyId } = req.params;
    const updates = req.body;
    const { reason } = updates;
    
    const policy = await ClassificationOverride.findOne({ policyId });
    
    if (!policy) {
      return notFoundResponse(res, 'Policy not found');
    }
    
    // Store previous state for history
    const previousState = policy.toObject();
    delete previousState.modificationHistory;
    
    // Update allowed fields
    const allowedFields = [
      'name', 'description', 'rules', 'ruleLogic', 'action',
      'targetCriteria', 'priority', 'isActive', 'effectiveFrom', 'effectiveUntil'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        policy[field] = updates[field];
      }
    });
    
    policy.lastModifiedBy = req.user._id;
    policy.modificationHistory.push({
      action: 'updated',
      modifiedBy: req.user._id,
      modifiedAt: new Date(),
      reason: reason || 'Policy updated',
      previousState
    });
    
    await policy.save();
    
    // Mark that policies have been modified
    await policyScreeningService.markPoliciesModified();
    
    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'policy_updated',
      category: 'policy',
      resourceType: 'classification_policy',
      resourceId: policy._id,
      resourceName: policy.name,
      description: `Updated classification policy: ${policy.name}`,
      metadata: {
        policyId: policy.policyId,
        updatedFields: Object.keys(updates).filter(k => k !== 'reason')
      },
      success: true
    });
    
    logger.info(`Classification policy updated: ${policyId} by user ${req.user._id}`);
    
    return successResponse(res, policy, 'Policy updated successfully');
    
  } catch (error) {
    logger.error('Update classification policy error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Delete (deactivate) a classification override policy
 */
export const deleteClassificationPolicy = async (req, res) => {
  try {
    const { policyId } = req.params;
    const { reason, hardDelete } = req.body;
    
    const policy = await ClassificationOverride.findOne({ policyId });
    
    if (!policy) {
      return notFoundResponse(res, 'Policy not found');
    }
    
    if (hardDelete === true) {
      // Permanently delete the policy
      await ClassificationOverride.deleteOne({ policyId });
      
      await AuditLog.create({
        userId: req.user._id,
        action: 'policy_deleted',
        category: 'policy',
        resourceType: 'classification_policy',
        resourceId: policy._id,
        resourceName: policy.name,
        description: `Permanently deleted classification policy: ${policy.name}`,
        metadata: {
          policyId: policy.policyId,
          reason
        },
        success: true
      });
      
      logger.info(`Classification policy permanently deleted: ${policyId} by user ${req.user._id}`);
      
      return successResponse(res, null, 'Policy permanently deleted');
    }
    
    // Soft delete - just deactivate
    policy.isActive = false;
    policy.lastModifiedBy = req.user._id;
    policy.modificationHistory.push({
      action: 'deactivated',
      modifiedBy: req.user._id,
      modifiedAt: new Date(),
      reason: reason || 'Policy deactivated'
    });
    
    await policy.save();
    
    // Mark that policies have been modified
    await policyScreeningService.markPoliciesModified();
    
    await AuditLog.create({
      userId: req.user._id,
      action: 'policy_deactivated',
      category: 'policy',
      resourceType: 'classification_policy',
      resourceId: policy._id,
      resourceName: policy.name,
      description: `Deactivated classification policy: ${policy.name}`,
      metadata: {
        policyId: policy.policyId,
        reason
      },
      success: true
    });
    
    logger.info(`Classification policy deactivated: ${policyId} by user ${req.user._id}`);
    
    return successResponse(res, policy, 'Policy deactivated successfully');
    
  } catch (error) {
    logger.error('Delete classification policy error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Apply all active policies to existing families (bulk re-screening)
 */
export const applyClassificationPolicies = async (req, res) => {
  try {
    logger.info(`Bulk policy application triggered by user ${req.user._id}`);
    
    const result = await policyScreeningService.bulkRescreen(req.user._id);
    
    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'policies_applied',
      category: 'system',
      resourceType: 'classification_policies',
      description: 'Applied all active classification policies to existing families',
      metadata: {
        totalFamilies: result.totalFamilies,
        reclassified: result.reclassified,
        unchanged: result.unchanged,
        errors: result.errors
      },
      success: true
    });
    
    return successResponse(res, result, 'Policy application completed');
    
  } catch (error) {
    logger.error('Apply classification policies error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get policy application status
 */
export const getPolicyApplicationStatus = async (req, res) => {
  try {
    const status = await policyScreeningService.getPolicyApplicationStatus();
    return successResponse(res, status);
  } catch (error) {
    logger.error('Get policy application status error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Get available fields for policy rules (from feature names)
 */
export const getPolicyRuleFields = async (req, res) => {
  try {
    // These are the fields that can be used in classification policies
    // Based on Family model and feature_names.json
    const fields = [
      // Income Features
      { field: 'highest_earner_monthly', label: 'Highest Earner Monthly Income', type: 'number', category: 'income' },
      { field: 'annual_income', label: 'Annual Income', type: 'number', category: 'income' },
      
      // Family Demographics
      { field: 'family_size', label: 'Family Size', type: 'number', category: 'demographics' },
      { field: 'head_age', label: 'Head of Family Age', type: 'number', category: 'demographics' },
      { field: 'children_0_6', label: 'Children (0-6 years)', type: 'number', category: 'demographics' },
      { field: 'children_6_14', label: 'Children (6-14 years)', type: 'number', category: 'demographics' },
      { field: 'adults_16_59', label: 'Adults (16-59 years)', type: 'number', category: 'demographics' },
      { field: 'adult_males_16_59', label: 'Adult Males (16-59)', type: 'number', category: 'demographics' },
      { field: 'adult_females_16_59', label: 'Adult Females (16-59)', type: 'number', category: 'demographics' },
      { field: 'elderly_60_plus', label: 'Elderly (60+)', type: 'number', category: 'demographics' },
      { field: 'working_members', label: 'Working Members', type: 'number', category: 'demographics' },
      
      // Land & Agriculture
      { field: 'total_land_acres', label: 'Total Land (acres)', type: 'number', category: 'land' },
      { field: 'irrigated_land_acres', label: 'Irrigated Land (acres)', type: 'number', category: 'land' },
      
      // Housing
      { field: 'house_type', label: 'House Type', type: 'select', options: ['houseless', 'temporary_plastic', 'kucha', 'semi_pucca', 'pucca'], category: 'housing' },
      { field: 'num_rooms', label: 'Number of Rooms', type: 'number', category: 'housing' },
      
      // Assets - Exclusion Criteria
      { field: 'owns_two_wheeler', label: 'Owns Two Wheeler', type: 'boolean', category: 'assets' },
      { field: 'owns_four_wheeler', label: 'Owns Four Wheeler (Car)', type: 'boolean', category: 'assets' },
      { field: 'owns_tractor', label: 'Owns Tractor', type: 'boolean', category: 'assets' },
      { field: 'owns_mechanized_equipment', label: 'Owns Mechanized Equipment', type: 'boolean', category: 'assets' },
      { field: 'owns_refrigerator', label: 'Owns Refrigerator', type: 'boolean', category: 'assets' },
      { field: 'owns_landline', label: 'Owns Landline Phone', type: 'boolean', category: 'assets' },
      { field: 'owns_tv', label: 'Owns TV', type: 'boolean', category: 'assets' },
      { field: 'owns_mobile', label: 'Owns Mobile Phone', type: 'boolean', category: 'assets' },
      
      // Amenities
      { field: 'has_electricity', label: 'Has Electricity', type: 'boolean', category: 'amenities' },
      { field: 'has_water_tap', label: 'Has Water Tap', type: 'boolean', category: 'amenities' },
      { field: 'has_toilet', label: 'Has Toilet', type: 'boolean', category: 'amenities' },
      
      // Financial Status
      { field: 'has_bank_account', label: 'Has Bank Account', type: 'boolean', category: 'financial' },
      { field: 'has_savings', label: 'Has Savings', type: 'boolean', category: 'financial' },
      { field: 'has_loan', label: 'Has Loan', type: 'boolean', category: 'financial' },
      
      // Special Categories
      { field: 'is_female_headed', label: 'Female Headed Household', type: 'boolean', category: 'special' },
      { field: 'is_pvtg', label: 'PVTG (Primitive Tribal Group)', type: 'boolean', category: 'special' },
      { field: 'is_minority', label: 'Minority Community', type: 'boolean', category: 'special' },
      { field: 'is_informal', label: 'Informal Sector Worker', type: 'boolean', category: 'special' },
      { field: 'is_houseless', label: 'Houseless', type: 'boolean', category: 'special' },
      
      // Education
      { field: 'education_code', label: 'Education Level', type: 'number', category: 'education' },
      { field: 'literate_adults_above_25', label: 'Literate Adults (25+)', type: 'number', category: 'education' }
    ];
    
    // Target criteria options (reasons the AI might classify someone)
    const targetCriteriaOptions = [
      // Exclusion criteria
      'two-wheeler',
      'four-wheeler',
      'car',
      'motor vehicle',
      'tractor',
      'mechanized',
      'refrigerator',
      'landline',
      'pucca house',
      '3+ rooms',
      '2.5+ acres',
      'land ownership',
      'income tax',
      'professional tax',
      'government employee',
      
      // Inclusion criteria
      'houseless',
      'primitive tribal',
      'pvtg',
      'destitute',
      'manual scavenger',
      'bonded laborer',
      
      // Deprivation indicators
      'kucha house',
      'no adults 16-59',
      'female-headed',
      'no literate adult',
      'landless',
      'SC/ST',
      'low income'
    ];
    
    return successResponse(res, {
      fields,
      targetCriteriaOptions,
      operators: [
        { value: 'equals', label: 'Equals', applicableTo: ['number', 'string', 'select'] },
        { value: 'not_equals', label: 'Not Equals', applicableTo: ['number', 'string', 'select'] },
        { value: 'greater_than', label: 'Greater Than', applicableTo: ['number'] },
        { value: 'less_than', label: 'Less Than', applicableTo: ['number'] },
        { value: 'greater_than_or_equal', label: 'Greater Than or Equal', applicableTo: ['number'] },
        { value: 'less_than_or_equal', label: 'Less Than or Equal', applicableTo: ['number'] },
        { value: 'is_true', label: 'Is True', applicableTo: ['boolean'] },
        { value: 'is_false', label: 'Is False', applicableTo: ['boolean'] },
        { value: 'contains', label: 'Contains', applicableTo: ['string', 'array'] },
        { value: 'not_contains', label: 'Does Not Contain', applicableTo: ['string', 'array'] }
      ],
      policyTypes: [
        { value: 'exclusion_override', label: 'Override Exclusion Criteria', description: 'Ignore specific exclusion criteria (e.g., car ownership)' },
        { value: 'inclusion_override', label: 'Override Inclusion Criteria', description: 'Add or modify inclusion criteria for BPL' },
        { value: 'threshold_override', label: 'Threshold Override', description: 'Override income or other thresholds' }
      ],
      actions: [
        { value: 'reclassify_to_bpl', label: 'Reclassify to BPL', description: 'Change classification from APL to BPL' },
        { value: 'reclassify_to_apl', label: 'Reclassify to APL', description: 'Change classification from BPL to APL' },
        { value: 'ignore_criterion', label: 'Ignore Classification Criterion', description: 'Ignore specific AI classification criteria' },
        { value: 'flag_for_review', label: 'Flag for Manual Review', description: 'Mark for manual review without changing classification' }
      ]
    });
    
  } catch (error) {
    logger.error('Get policy rule fields error:', error);
    return errorResponse(res, error.message, 500);
  }
};

export default {
  getDashboardStats,
  getPendingVerifications,
  verifyEntity,
  getIncomeDistribution,
  getAnomalyAlerts,
  resolveAnomaly,
  getWelfareSchemes,
  checkSchemeEligibility,
  createWelfareScheme,
  updateWelfareScheme,
  deleteWelfareScheme,
  generateReport,
  runAnomalyScan,
  // Classification Policy Management
  getClassificationPolicies,
  getClassificationPolicy,
  createClassificationPolicy,
  updateClassificationPolicy,
  deleteClassificationPolicy,
  applyClassificationPolicies,
  getPolicyApplicationStatus,
  getPolicyRuleFields
};
