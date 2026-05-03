/**
 * Analytics Routes
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { govOrAdmin, employerOnly } from '../middleware/role.middleware.js';
import { validate, validatePagination } from '../middleware/validation.middleware.js';
import { reportLimiter } from '../middleware/rateLimit.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { successResponse } from '../utils/response.util.js';
import { query, body } from 'express-validator';
import { ROLES } from '../config/constants.js';
import { Worker, Employer, WageRecord, AnomalyAlert, UPITransaction } from '../models/index.js';

const router = Router();

const findEmployerByUserId = async (userId) => {
  let employer = await Employer.findOne({ userId });
  if (!employer) {
    employer = await Employer.findOne({ user: userId });
    if (employer && !employer.userId) {
      employer.userId = userId;
      await employer.save();
    }
  }
  return employer;
};

/**
 * @route GET /api/analytics/overview
 * @desc Get system-wide analytics overview
 * @access Private (Government, Admin)
 */
router.get(
  '/overview',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const [
      workerStats,
      employerStats,
      transactionStats,
      bplStats
    ] = await Promise.all([
      // Worker statistics
      Worker.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
            avgIncome: { $avg: '$totalIncome.annual' }
          }
        }
      ]),
      // Employer statistics
      Employer.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
            totalWorkers: { $sum: '$statistics.totalWorkersEmployed' }
          }
        }
      ]),
      // Transaction statistics
      WageRecord.aggregate([
        { $match: { ...dateFilter, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]),
      // BPL statistics
      Worker.aggregate([
        {
          $group: {
            _id: '$bplClassification.status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const overview = {
      workers: workerStats[0] || { total: 0, verified: 0, avgIncome: 0 },
      employers: employerStats[0] || { total: 0, verified: 0, totalWorkers: 0 },
      transactions: transactionStats[0] || { totalTransactions: 0, totalAmount: 0, avgAmount: 0 },
      bplDistribution: bplStats.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {}),
      period: { startDate, endDate }
    };

    return successResponse(res, { overview }, 'Analytics overview retrieved');
  })
);

/**
 * @route GET /api/analytics/income-trends
 * @desc Get income trends over time
 * @access Private (Government, Admin)
 */
router.get(
  '/income-trends',
  authenticate,
  govOrAdmin,
  [
    query('period').optional().isIn(['daily', 'weekly', 'monthly', 'yearly']),
    query('months').optional().isInt({ min: 1, max: 24 })
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { period = 'monthly', months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    let dateFormat;
    switch (period) {
      case 'daily':
        dateFormat = '%Y-%m-%d';
        break;
      case 'weekly':
        dateFormat = '%Y-W%V';
        break;
      case 'yearly':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m';
    }

    const trends = await WageRecord.aggregate([
      {
        $match: {
          paymentDate: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$paymentDate' } },
          totalAmount: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          uniqueWorkers: { $addToSet: '$worker' }
        }
      },
      {
        $project: {
          period: '$_id',
          totalAmount: 1,
          transactionCount: 1,
          avgAmount: 1,
          uniqueWorkers: { $size: '$uniqueWorkers' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return successResponse(res, { trends, period, months }, 'Income trends retrieved');
  })
);

/**
 * @route GET /api/analytics/geographic
 * @desc Get geographic distribution of workers/income
 * @access Private (Government, Admin)
 */
router.get(
  '/geographic',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const geoStats = await Worker.aggregate([
      {
        $group: {
          _id: {
            state: '$address.state',
            district: '$address.district'
          },
          workerCount: { $sum: 1 },
          bplCount: { $sum: { $cond: [{ $eq: ['$bplClassification.status', 'BPL'] }, 1, 0] } },
          totalIncome: { $sum: '$totalIncome.annual' },
          avgIncome: { $avg: '$totalIncome.annual' }
        }
      },
      {
        $group: {
          _id: '$_id.state',
          districts: {
            $push: {
              district: '$_id.district',
              workerCount: '$workerCount',
              bplCount: '$bplCount',
              avgIncome: '$avgIncome'
            }
          },
          totalWorkers: { $sum: '$workerCount' },
          totalBPL: { $sum: '$bplCount' },
          stateAvgIncome: { $avg: '$avgIncome' }
        }
      },
      { $sort: { totalWorkers: -1 } }
    ]);

    return successResponse(res, { geoStats }, 'Geographic distribution retrieved');
  })
);

/**
 * @route GET /api/analytics/anomaly-trends
 * @desc Get anomaly detection trends
 * @access Private (Government, Admin)
 */
router.get(
  '/anomaly-trends',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const { months = 6 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const [anomalyByType, anomalyByMonth, severityDistribution] = await Promise.all([
      AnomalyAlert.aggregate([
        { $match: { detectedAt: { $gte: startDate } } },
        { $group: { _id: '$anomalyType', count: { $sum: 1 } } }
      ]),
      AnomalyAlert.aggregate([
        { $match: { detectedAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$detectedAt' } },
            count: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      AnomalyAlert.aggregate([
        { $match: { detectedAt: { $gte: startDate } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ])
    ]);

    return successResponse(res, {
      byType: anomalyByType,
      byMonth: anomalyByMonth,
      bySeverity: severityDistribution
    }, 'Anomaly trends retrieved');
  })
);

/**
 * @route GET /api/analytics/payment-methods
 * @desc Get payment method distribution
 * @access Private (Government, Admin, Employer)
 */
router.get(
  '/payment-methods',
  authenticate,
  asyncHandler(async (req, res) => {
    if (![ROLES.ADMIN, ROLES.GOVERNMENT, ROLES.EMPLOYER].includes(req.user.role)) {
      throw new AppError('Unauthorized', 403);
    }

    const filter = {};
    if (req.user.role === ROLES.EMPLOYER) {
      const employer = await findEmployerByUserId(req.user.id);
      if (employer) filter.employer = employer._id;
    }

    const paymentStats = await WageRecord.aggregate([
      { $match: { ...filter, status: 'completed' } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    const upiStats = await UPITransaction.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalUPI: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgProcessingTime: { $avg: { 
            $subtract: ['$completedAt', '$initiatedAt'] 
          }}
        }
      }
    ]);

    return successResponse(res, {
      paymentMethods: paymentStats,
      upiSummary: upiStats[0] || { totalUPI: 0, totalAmount: 0 }
    }, 'Payment method analytics retrieved');
  })
);

/**
 * @route GET /api/analytics/employer/:id
 * @desc Get analytics for specific employer
 * @access Private (Owner, Government, Admin)
 */
router.get(
  '/employer/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    // Authorization check
    if (req.user.role !== ROLES.ADMIN && 
        req.user.role !== ROLES.GOVERNMENT && 
        employer.userId.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    const { months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const [
      monthlyPayments,
      workerStats,
      paymentMethodBreakdown
    ] = await Promise.all([
      WageRecord.aggregate([
        { 
          $match: { 
            employer: employer._id, 
            paymentDate: { $gte: startDate },
            status: 'completed' 
          } 
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            uniqueWorkers: { $addToSet: '$worker' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Worker.aggregate([
        { $match: { currentEmployer: employer._id } },
        {
          $group: {
            _id: '$bplClassification.status',
            count: { $sum: 1 },
            avgIncome: { $avg: '$totalIncome.annual' }
          }
        }
      ]),
      WageRecord.aggregate([
        { $match: { employer: employer._id, status: 'completed' } },
        { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }
      ])
    ]);

    return successResponse(res, {
      monthlyPayments: monthlyPayments.map(m => ({
        ...m,
        uniqueWorkers: m.uniqueWorkers.length
      })),
      workerStats,
      paymentMethodBreakdown
    }, 'Employer analytics retrieved');
  })
);

/**
 * @route POST /api/analytics/export
 * @desc Export analytics data
 * @access Private (Government, Admin)
 */
router.post(
  '/export',
  authenticate,
  govOrAdmin,
  reportLimiter,
  [
    body('type').isIn(['workers', 'transactions', 'bpl', 'anomalies']),
    body('format').optional().isIn(['json', 'csv']),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { type, format = 'json', startDate, endDate, filters = {} } = req.body;
    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    let data;
    switch (type) {
      case 'workers':
        data = await Worker.find({ ...dateFilter, ...filters })
          .select('-__v')
          .lean();
        break;
      case 'transactions':
        data = await WageRecord.find({ ...dateFilter, ...filters })
          .populate('worker', 'name idHash')
          .populate('employer', 'companyName')
          .select('-__v')
          .lean();
        break;
      case 'bpl':
        data = await Worker.find({ 
          'bplClassification.status': 'BPL',
          ...dateFilter,
          ...filters 
        })
          .select('name idHash totalIncome bplClassification address')
          .lean();
        break;
      case 'anomalies':
        data = await AnomalyAlert.find({ ...dateFilter, ...filters })
          .populate('worker', 'name idHash')
          .select('-__v')
          .lean();
        break;
    }

    if (format === 'csv') {
      // Convert to CSV (simplified)
      const headers = data.length > 0 ? Object.keys(data[0]).join(',') : '';
      const rows = data.map(row => Object.values(row).map(v => 
        typeof v === 'object' ? JSON.stringify(v) : v
      ).join(','));
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-export.csv`);
      return res.send(csv);
    }

    return successResponse(res, { data, count: data.length, type }, 'Data exported');
  })
);

export default router;
