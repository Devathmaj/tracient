/**
 * Government Controller
 */
import { Worker, Employer, WageRecord, AnomalyAlert, WelfareScheme, AuditLog } from '../models/index.js';
import { successResponse, errorResponse, notFoundResponse, paginatedResponse } from '../utils/response.util.js';
import { paginateQuery, paginateAggregate } from '../utils/pagination.util.js';
import { calculateBPLStatus } from '../utils/bpl.util.js';
import { sendVerificationEmail, sendSchemeNotification } from '../services/email.service.js';
import { recordVerification } from '../services/fabric.service.js';
import { logger } from '../utils/logger.util.js';
import { VERIFICATION_STATUS, INCOME_CATEGORIES } from '../config/constants.js';

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
        worker: worker._id,
        ...wageQuery
      })
        .sort({ createdAt: -1 })
        .limit(24)
        .select('amount createdAt paymentMode verificationStatus employer')
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
      
      // Verification patterns
      const unverifiedCount = wageRecords.filter(w => 
        w.verificationStatus !== 'blockchain_verified' && w.verificationStatus !== 'verified'
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
            detectionMethod: scanResult.detectionMethod === 'ml_and_rules' ? 'ai_model' : 'rule_based',
            confidence: result.anomaly_score || 50,
            status: 'pending',
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
      entityType: 'system',
      entityId: null,
      details: {
        totalScanned: scanResult.totalScanned,
        anomaliesFound: scanResult.anomaliesFound,
        newAlertsCreated: newAlerts.length,
        detectionMethod: scanResult.detectionMethod
      }
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

export default {
  getDashboardStats,
  getPendingVerifications,
  verifyEntity,
  getIncomeDistribution,
  getAnomalyAlerts,
  resolveAnomaly,
  getWelfareSchemes,
  checkSchemeEligibility,
  generateReport,
  runAnomalyScan
};
