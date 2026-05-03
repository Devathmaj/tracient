/**
 * Employer Routes
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, adminOnly, govOrAdmin, employerOnly } from '../middleware/role.middleware.js';
import { validate, validateObjectId, validatePagination } from '../middleware/validation.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { successResponse, paginatedResponse, errorResponse, notFoundResponse } from '../utils/response.util.js';
import { paginateQuery } from '../utils/pagination.util.js';
import { body, query, param } from 'express-validator';
import { ROLES, VERIFICATION_STATUS } from '../config/constants.js';
import { Employer, User, Worker, WageRecord } from '../models/index.js';
import { auditLog, logger } from '../utils/logger.util.js';

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

// Middleware to ensure employer profile exists for dual-role users
const ensureEmployerProfile = asyncHandler(async (req, res, next) => {
  // Skip for the apply route itself to avoid loops
  if (req.path === '/profile/apply') return next();
  
  if (req.user) {
    let employer = await findEmployerByUserId(req.user.id);
    if (!employer) {
      const user = await User.findById(req.user.id);
      if (user) {
        employer = await Employer.create({
          userId: user._id,
          companyName: user.name || 'My Business',
          contactPerson: user.name,
          email: user.email,
          phone: user.phone || 'UNKNOWN'
        });
        
        if (user.role !== ROLES.EMPLOYER) {
          user.role = ROLES.EMPLOYER;
          await user.save();
        }
        logger.info('Auto-created employer profile for user', { userId: user._id });
      }
    }
  }
  next();
});

// Apply authentication and employer profile check to all employer routes
router.use(authenticate, ensureEmployerProfile);

/**
 * @route GET /api/employers/profile
 * @desc Get current employer's profile
 * @access Private (Employer)
 */
router.get(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id)
      .populate('userId', 'email role isActive lastLogin');
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }
    
    return successResponse(res, { employer });
  })
);

/**
 * @route POST /api/employers/profile/apply
 * @desc Create employer profile for an existing user (Apply to be Employer)
 * @access Private (Any authenticated user)
 */
router.post(
  '/profile/apply',
  authenticate,
  [
    body('businessName').trim().notEmpty().withMessage('Business name is required'),
    body('pan').optional().trim(),
    body('gstin').optional().trim()
  ],
  validate,
  asyncHandler(async (req, res) => {
    // Check if employer profile already exists
    const existing = await findEmployerByUserId(req.user.id);
    if (existing) {
      return successResponse(res, { employer: existing }, 'Employer profile already exists');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return notFoundResponse(res, 'User not found');
    }

    const { businessName, pan, gstin } = req.body;

    // Create employer profile
    const employer = await Employer.create({
      userId: user._id,
      companyName: businessName,
      contactPerson: user.name,
      email: user.email,
      phone: user.phone || '',
      panNumber: pan || undefined,
      gstin: gstin || undefined
    });

    // Update user role to employer if not already
    if (user.role !== ROLES.EMPLOYER) {
      user.role = ROLES.EMPLOYER;
      await user.save();
    }

    logger.info('Employer profile created via apply', { userId: user._id, employerId: employer._id });

    return successResponse(res, { employer }, 'Employer profile created successfully', 201);
  })
);

/**
 * @route PUT /api/employers/profile
 * @desc Update current employer's profile
 * @access Private (Employer)
 */
router.put(
  '/profile',
  authenticate,
  [
    body('companyName').optional().trim().notEmpty(),
    body('businessType').optional().trim(),
    body('gstin').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
    body('address').optional().isObject(),
    body('contactPerson').optional().trim()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }
    
    const { companyName, businessType, gstin, address, contactPerson, phone, website } = req.body;
    
    if (companyName) employer.companyName = companyName;
    if (businessType) employer.businessType = businessType;
    if (gstin) employer.gstin = gstin;
    if (address) employer.address = address;
    if (contactPerson) employer.contactPerson = contactPerson;
    if (phone) employer.phone = phone;
    if (website) employer.website = website;
    
    await employer.save();
    
    logger.info('Employer profile updated', { employerId: employer._id });
    
    return successResponse(res, { employer }, 'Profile updated successfully');
  })
);

/**
 * @route GET /api/employers/profile/payments
 * @desc Get current employer's payment summary
 * @access Private (Employer)
 */
router.get(
  '/profile/payments',
  authenticate,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }
    
    // Get wage records
    const wageRecords = await WageRecord.find({
      employerId: employer._id,
      status: 'completed'
    }).sort({ createdAt: -1 });
    
    const totalPaid = wageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // Get unique workers paid
    const workerIds = [...new Set(wageRecords.map(w => w.workerId.toString()))];
    const workerCount = workerIds.length;
    
    const transactionCount = wageRecords.length;
    const avgWage = transactionCount > 0 ? Math.round(totalPaid / transactionCount) : 0;
    
    // Last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last30Days = wageRecords
      .filter(w => new Date(w.createdAt) >= thirtyDaysAgo)
      .reduce((sum, w) => sum + w.amount, 0);
    
    return successResponse(res, {
      totalPaid,
      workerCount,
      transactionCount,
      avgWage,
      last30Days,
      lastUpdated: new Date()
    });
  })
);

/**
 * @route GET /api/employers/profile/workers
 * @desc Get workers paid by current employer
 * @access Private (Employer)
 */
router.get(
  '/profile/workers',
  authenticate,
  validatePagination,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }
    
    // Get unique workers this employer has paid
    const wageRecords = await WageRecord.find({ employerId: employer._id })
      .populate('workerId', 'name phone idHash maskedAadhaar')
      .sort({ createdAt: -1 });
    
    // Group by worker
    const workerMap = new Map();
    wageRecords.forEach(record => {
      if (record.workerId) {
        const workerId = record.workerId._id.toString();
        if (!workerMap.has(workerId)) {
          workerMap.set(workerId, {
            worker: record.workerId,
            totalPaid: 0,
            transactionCount: 0,
            lastPayment: record.createdAt
          });
        }
        const entry = workerMap.get(workerId);
        entry.totalPaid += record.amount;
        entry.transactionCount += 1;
      }
    });
    
    const workers = Array.from(workerMap.values());
    
    return successResponse(res, { workers, count: workers.length });
  })
);

/**
 * @route GET /api/employers/profile/dashboard
 * @desc Get comprehensive employer dashboard data
 * @access Private (Employer)
 */
router.get(
  '/profile/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get all completed wage records for this employer
    const allWageRecords = await WageRecord.find({
      employerId: employer._id,
      status: 'completed'
    }).populate('workerId', 'name phone idHash').sort({ createdAt: -1 });

    // Calculate stats
    const totalPayments = allWageRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // Current month payments
    const currentMonthRecords = allWageRecords.filter(w => {
      const d = new Date(w.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const currentMonthPayroll = currentMonthRecords.reduce((sum, w) => sum + w.amount, 0);
    
    // Previous month for trend calculation
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonthRecords = allWageRecords.filter(w => {
      const d = new Date(w.createdAt);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });
    const prevMonthPayroll = prevMonthRecords.reduce((sum, w) => sum + w.amount, 0);
    const trend = prevMonthPayroll > 0 
      ? Math.round(((currentMonthPayroll - prevMonthPayroll) / prevMonthPayroll) * 100 * 10) / 10
      : 0;

    // Unique workers (paid + linked)
    const workerMap = new Map();
    allWageRecords.forEach(record => {
      if (record.workerId) {
        const workerId = record.workerId._id.toString();
        if (!workerMap.has(workerId)) {
          workerMap.set(workerId, {
            id: record.workerId._id,
            name: record.workerId.name,
            phone: record.workerId.phone,
            idHash: record.workerId.idHash,
            totalPaid: 0,
            paymentCount: 0,
            lastPayment: record.createdAt,
            firstPayment: record.createdAt
          });
        }
        const entry = workerMap.get(workerId);
        entry.totalPaid += record.amount;
        entry.paymentCount += 1;
        if (new Date(record.createdAt) < new Date(entry.firstPayment)) {
          entry.firstPayment = record.createdAt;
        }
      }
    });

    const linkedWorkers = await Worker.find({ currentEmployerId: employer._id })
      .select('name phone idHash')
      .lean();
    linkedWorkers.forEach(worker => {
      const workerId = worker._id.toString();
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: worker._id,
          name: worker.name,
          phone: worker.phone,
          idHash: worker.idHash,
          totalPaid: 0,
          paymentCount: 0,
          lastPayment: null,
          firstPayment: null
        });
      }
    });

    const { WorkerRequest } = await import('../models/index.js');
    const acceptedRequests = await WorkerRequest.find({
      employerId: employer._id,
      status: 'accepted'
    })
      .populate('workerId', 'name phone idHash')
      .lean();

    acceptedRequests.forEach(request => {
      if (!request.workerId) return;
      const workerId = request.workerId._id.toString();
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: request.workerId._id,
          name: request.workerId.name,
          phone: request.workerId.phone,
          idHash: request.workerId.idHash,
          totalPaid: 0,
          paymentCount: 0,
          lastPayment: null,
          firstPayment: null
        });
      }
    });
    
    const totalWorkers = workerMap.size;
    // Active workers = linked or paid in last 3 months
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const activeWorkers = Array.from(workerMap.values()).filter(w => {
      if (!w.lastPayment) return true;
      return new Date(w.lastPayment) >= threeMonthsAgo;
    }).length;

    // Monthly payroll trend (last 12 months)
    const monthlyPayrollTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();
      const monthRecords = allWageRecords.filter(w => {
        const wd = new Date(w.createdAt);
        return wd.getMonth() === month && wd.getFullYear() === year;
      });
      const amount = monthRecords.reduce((sum, w) => sum + w.amount, 0);
      monthlyPayrollTrend.push({
        month: d.toLocaleString('default', { month: 'short' }),
        year: year,
        amount
      });
    }

    // Payments by description/category
    const categoryMap = new Map();
    allWageRecords.forEach(record => {
      const category = record.description || 'General Wage';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, 0);
      }
      categoryMap.set(category, categoryMap.get(category) + record.amount);
    });
    const paymentsByCategory = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Recent payments (last 10)
    const recentPayments = allWageRecords.slice(0, 10).map(record => ({
      id: record._id,
      worker: record.workerId?.name || 'Unknown',
      workerId: record.workerId?._id,
      amount: record.amount,
      date: record.createdAt,
      status: record.status,
      description: record.description,
      referenceNumber: record.referenceNumber
    }));

    // Yearly summary
    const yearlyPayments = allWageRecords
      .filter(w => new Date(w.createdAt).getFullYear() === currentYear)
      .reduce((sum, w) => sum + w.amount, 0);

    return successResponse(res, {
      companyName: employer.companyName,
      totalWorkers,
      activeWorkers,
      totalPayments,
      currentMonthPayroll,
      yearlyPayments,
      trend,
      transactionCount: allWageRecords.length,
      monthlyPayrollTrend,
      paymentsByCategory,
      recentPayments,
      lastUpdated: new Date()
    });
  })
);

/**
 * @route GET /api/employers/profile/workers/detailed
 * @desc Get detailed worker list with payment breakdown
 * @access Private (Employer)
 */
router.get(
  '/profile/workers/detailed',
  authenticate,
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const { search, sortBy = 'totalPaid', order = 'desc' } = req.query;

    // Get all wage records for this employer
    const allWageRecords = await WageRecord.find({
      employerId: employer._id,
      status: 'completed'
    }).populate('workerId', 'name phone email idHash maskedAadhaar userId')
      .sort({ createdAt: -1 });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Group by worker with detailed stats
    const workerMap = new Map();
    
    allWageRecords.forEach(record => {
      if (!record.workerId) return;
      
      const workerId = record.workerId._id.toString();
      const recordDate = new Date(record.createdAt);
      const recordMonth = recordDate.getMonth();
      const recordYear = recordDate.getFullYear();
      
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: record.workerId._id,
          name: record.workerId.name || 'Unknown',
          phone: record.workerId.phone,
          email: record.workerId.email,
          idHash: record.workerId.idHash,
          maskedAadhaar: record.workerId.maskedAadhaar,
          totalPaid: 0,
          paymentCount: 0,
          currentMonthPaid: 0,
          currentYearPaid: 0,
          lastPaymentDate: record.createdAt,
          firstPaymentDate: record.createdAt,
          monthlyBreakdown: {},
          recentPayments: [],
          status: 'active'
        });
      }
      
      const worker = workerMap.get(workerId);
      worker.totalPaid += record.amount;
      worker.paymentCount += 1;
      
      // Current month
      if (recordMonth === currentMonth && recordYear === currentYear) {
        worker.currentMonthPaid += record.amount;
      }
      
      // Current year
      if (recordYear === currentYear) {
        worker.currentYearPaid += record.amount;
      }
      
      // Monthly breakdown
      const monthKey = `${recordYear}-${String(recordMonth + 1).padStart(2, '0')}`;
      if (!worker.monthlyBreakdown[monthKey]) {
        worker.monthlyBreakdown[monthKey] = { amount: 0, count: 0 };
      }
      worker.monthlyBreakdown[monthKey].amount += record.amount;
      worker.monthlyBreakdown[monthKey].count += 1;
      
      // Update dates
      if (recordDate > new Date(worker.lastPaymentDate)) {
        worker.lastPaymentDate = record.createdAt;
      }
      if (recordDate < new Date(worker.firstPaymentDate)) {
        worker.firstPaymentDate = record.createdAt;
      }
      
      // Recent payments (keep last 5)
      if (worker.recentPayments.length < 5) {
        worker.recentPayments.push({
          id: record._id,
          amount: record.amount,
          date: record.createdAt,
          description: record.description,
          referenceNumber: record.referenceNumber
        });
      }
    });

    const linkedWorkers = await Worker.find({ currentEmployerId: employer._id })
      .select('name phone email idHash maskedAadhaar')
      .lean();
    linkedWorkers.forEach(worker => {
      const workerId = worker._id.toString();
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: worker._id,
          name: worker.name || 'Unknown',
          phone: worker.phone,
          email: worker.email,
          idHash: worker.idHash,
          maskedAadhaar: worker.maskedAadhaar,
          totalPaid: 0,
          paymentCount: 0,
          currentMonthPaid: 0,
          currentYearPaid: 0,
          lastPaymentDate: null,
          firstPaymentDate: null,
          monthlyBreakdown: {},
          recentPayments: [],
          status: 'active'
        });
      }
    });

    const { WorkerRequest } = await import('../models/index.js');
    const acceptedRequests = await WorkerRequest.find({
      employerId: employer._id,
      status: 'accepted'
    })
      .populate('workerId', 'name phone email idHash maskedAadhaar')
      .lean();

    acceptedRequests.forEach(request => {
      if (!request.workerId) return;
      const workerId = request.workerId._id.toString();
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: request.workerId._id,
          name: request.workerId.name || 'Unknown',
          phone: request.workerId.phone,
          email: request.workerId.email,
          idHash: request.workerId.idHash,
          maskedAadhaar: request.workerId.maskedAadhaar,
          totalPaid: 0,
          paymentCount: 0,
          currentMonthPaid: 0,
          currentYearPaid: 0,
          lastPaymentDate: null,
          firstPaymentDate: null,
          monthlyBreakdown: {},
          recentPayments: [],
          status: 'active'
        });
      }
    });

    // Determine active/inactive status (inactive if no payment in last 3 months)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    workerMap.forEach(worker => {
      if (!worker.lastPaymentDate) {
        worker.status = 'active';
        return;
      }
      worker.status = new Date(worker.lastPaymentDate) >= threeMonthsAgo ? 'active' : 'inactive';
    });

    let workers = Array.from(workerMap.values());

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      workers = workers.filter(w => 
        w.name?.toLowerCase().includes(searchLower) ||
        w.phone?.includes(search) ||
        w.email?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    workers.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'totalPaid':
          comparison = a.totalPaid - b.totalPaid;
          break;
        case 'lastPayment':
          comparison = new Date(a.lastPaymentDate).getTime() - new Date(b.lastPaymentDate).getTime();
          break;
        case 'paymentCount':
          comparison = a.paymentCount - b.paymentCount;
          break;
        default:
          comparison = a.totalPaid - b.totalPaid;
      }
      return order === 'desc' ? -comparison : comparison;
    });

    const allWorkers = Array.from(workerMap.values());

    return successResponse(res, {
      workers,
      count: workers.length,
      summary: {
        totalWorkers: workerMap.size,
        activeWorkers: allWorkers.filter(w => w.status === 'active').length,
        inactiveWorkers: allWorkers.filter(w => w.status === 'inactive').length,
        totalPaidAllWorkers: allWorkers.reduce((sum, w) => sum + w.totalPaid, 0)
      }
    });
  })
);

/**
 * @route GET /api/employers/profile/workers/:workerId/payments
 * @desc Get payment history for a specific worker
 * @access Private (Employer)
 */
router.get(
  '/profile/workers/:workerId/payments',
  authenticate,
  validateObjectId('workerId'),
  asyncHandler(async (req, res) => {
    const employer = await findEmployerByUserId(req.user.id);
    
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const { workerId } = req.params;
    const { year, month } = req.query;

    // Build query
    const query = {
      employerId: employer._id,
      workerId: workerId,
      status: 'completed'
    };

    // Filter by year/month if provided
    if (year) {
      const startDate = new Date(parseInt(year), month ? parseInt(month) - 1 : 0, 1);
      const endDate = month 
        ? new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
        : new Date(parseInt(year), 11, 31, 23, 59, 59);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const payments = await WageRecord.find(query)
      .sort({ createdAt: -1 });

    const worker = await Worker.findById(workerId).select('name phone email idHash');

    // Calculate summary
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // Monthly breakdown
    const monthlyBreakdown = {};
    payments.forEach(p => {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyBreakdown[key]) {
        monthlyBreakdown[key] = { amount: 0, count: 0, payments: [] };
      }
      monthlyBreakdown[key].amount += p.amount;
      monthlyBreakdown[key].count += 1;
      monthlyBreakdown[key].payments.push({
        id: p._id,
        amount: p.amount,
        date: p.createdAt,
        description: p.description,
        referenceNumber: p.referenceNumber,
        paymentMethod: p.paymentMethod
      });
    });

    // Yearly breakdown
    const yearlyBreakdown = {};
    payments.forEach(p => {
      const year = new Date(p.createdAt).getFullYear();
      if (!yearlyBreakdown[year]) {
        yearlyBreakdown[year] = { amount: 0, count: 0 };
      }
      yearlyBreakdown[year].amount += p.amount;
      yearlyBreakdown[year].count += 1;
    });

    return successResponse(res, {
      worker: worker ? {
        id: worker._id,
        name: worker.name,
        phone: worker.phone,
        email: worker.email,
        idHash: worker.idHash
      } : null,
      payments: payments.map(p => ({
        id: p._id,
        amount: p.amount,
        date: p.createdAt,
        description: p.description,
        referenceNumber: p.referenceNumber,
        paymentMethod: p.paymentMethod,
        status: p.status
      })),
      summary: {
        totalPaid,
        paymentCount: payments.length,
        avgPayment: payments.length > 0 ? Math.round(totalPaid / payments.length) : 0
      },
      monthlyBreakdown,
      yearlyBreakdown
    });
  })
);

/**
 * @route GET /api/employers
 * @desc Get all employers
 * @access Private (Admin, Government)
 */
router.get(
  '/',
  authenticate,
  govOrAdmin,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { query: searchQuery, status, verified } = req.query;
    const filter = {};

    if (searchQuery) {
      filter.$or = [
        { companyName: { $regex: searchQuery, $options: 'i' } },
        { businessType: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    if (status) filter.verificationStatus = status;
    if (verified !== undefined) filter.isVerified = verified === 'true';

    const { data, pagination } = await paginateQuery(Employer, filter, req.query, {
      populate: { path: 'user', select: 'email createdAt lastLogin' },
      defaultSort: '-createdAt'
    });

    return paginatedResponse(res, data, pagination, 'Employers retrieved');
  })
);

/**
 * @route GET /api/employers/:id
 * @desc Get employer by ID
 * @access Private
 */
router.get(
  '/:id',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id)
      .populate('user', 'email createdAt lastLogin');

    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    // Only admin/gov or the employer themselves can view full details
    if (req.user.role !== ROLES.ADMIN && 
        req.user.role !== ROLES.GOVERNMENT && 
        employer.user._id.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    return successResponse(res, { employer }, 'Employer retrieved');
  })
);

/**
 * @route PUT /api/employers/:id
 * @desc Update employer profile
 * @access Private (Owner, Admin)
 */
router.put(
  '/:id',
  authenticate,
  validateObjectId('id'),
  [
    body('companyName').optional().trim().notEmpty(),
    body('businessType').optional().trim(),
    body('gstin').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
    body('address').optional().isObject(),
    body('contactPerson').optional().isObject()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    // Only admin or the employer themselves can update
    if (req.user.role !== ROLES.ADMIN && employer.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    const allowedUpdates = ['companyName', 'businessType', 'gstin', 'address', 'contactPerson'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(employer, updates);
    await employer.save();

    await auditLog({
      action: 'employer.update',
      userId: req.user.id,
      targetType: 'Employer',
      targetId: employer._id,
      details: { updates: Object.keys(updates) }
    });

    return successResponse(res, { employer }, 'Employer updated');
  })
);

/**
 * @route GET /api/employers/:id/workers
 * @desc Get workers of an employer
 * @access Private (Owner, Admin, Government)
 */
router.get(
  '/:id/workers',
  authenticate,
  validateObjectId('id'),
  validatePagination,
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    // Only admin, gov, or the employer themselves can view workers
    if (req.user.role !== ROLES.ADMIN && 
        req.user.role !== ROLES.GOVERNMENT && 
        employer.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    const filter = { currentEmployer: employer._id };
    
    const { data, pagination } = await paginateQuery(Worker, filter, req.query, {
      populate: { path: 'user', select: 'email' },
      defaultSort: '-employment.startDate'
    });

    return paginatedResponse(res, data, pagination, 'Workers retrieved');
  })
);

/**
 * @route GET /api/employers/:id/transactions
 * @desc Get transactions of an employer
 * @access Private (Owner, Admin, Government)
 */
router.get(
  '/:id/transactions',
  authenticate,
  validateObjectId('id'),
  validatePagination,
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    if (req.user.role !== ROLES.ADMIN && 
        req.user.role !== ROLES.GOVERNMENT && 
        employer.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    const filter = { employer: employer._id };
    
    if (req.query.startDate || req.query.endDate) {
      filter.paymentDate = {};
      if (req.query.startDate) filter.paymentDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.paymentDate.$lte = new Date(req.query.endDate);
    }

    const { data, pagination } = await paginateQuery(WageRecord, filter, req.query, {
      populate: [
        { path: 'worker', select: 'name idHash' }
      ],
      defaultSort: '-paymentDate'
    });

    return paginatedResponse(res, data, pagination, 'Transactions retrieved');
  })
);

/**
 * @route GET /api/employers/:id/stats
 * @desc Get employer statistics
 * @access Private (Owner, Admin, Government)
 */
router.get(
  '/:id/stats',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    if (req.user.role !== ROLES.ADMIN && 
        req.user.role !== ROLES.GOVERNMENT && 
        employer.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Get statistics
    const [workerCount, transactionStats] = await Promise.all([
      Worker.countDocuments({ currentEmployer: employer._id }),
      WageRecord.aggregate([
        { $match: { employer: employer._id } },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    const stats = {
      workerCount,
      totalTransactions: transactionStats[0]?.totalTransactions || 0,
      totalAmountPaid: transactionStats[0]?.totalAmount || 0,
      averageTransaction: transactionStats[0]?.avgAmount || 0,
      completedTransactions: transactionStats[0]?.completedCount || 0,
      ...employer.statistics
    };

    return successResponse(res, { stats }, 'Employer statistics retrieved');
  })
);

/**
 * @route PUT /api/employers/:id/verify
 * @desc Verify an employer
 * @access Private (Government, Admin)
 */
router.put(
  '/:id/verify',
  authenticate,
  govOrAdmin,
  validateObjectId('id'),
  [
    body('status').isIn(['verified', 'rejected']).withMessage('Invalid status'),
    body('remarks').optional().isString()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    const { status, remarks } = req.body;

    employer.verificationStatus = status;
    employer.isVerified = status === 'verified';
    employer.verification = {
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
      remarks
    };

    await employer.save();

    await auditLog({
      action: 'employer.verify',
      userId: req.user.id,
      targetType: 'Employer',
      targetId: employer._id,
      details: { status, remarks }
    });

    return successResponse(res, { employer }, `Employer ${status}`);
  })
);

/**
 * @route DELETE /api/employers/:id
 * @desc Delete/deactivate an employer
 * @access Private (Admin)
 */
router.delete(
  '/:id',
  authenticate,
  adminOnly,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const employer = await Employer.findById(req.params.id);
    
    if (!employer) {
      throw new AppError('Employer not found', 404);
    }

    // Soft delete - deactivate the user account
    await User.findByIdAndUpdate(employer.user, { isActive: false });

    await auditLog({
      action: 'employer.delete',
      userId: req.user.id,
      targetType: 'Employer',
      targetId: employer._id,
      details: { deactivated: true }
    });

    return successResponse(res, null, 'Employer deactivated');
  })
);

/**
 * @route GET /api/employers/welfare-schemes
 * @desc Get active welfare schemes visible to employers
 * @access Private (Employer)
 */
router.get(
  '/welfare-schemes',
  authenticate,
  asyncHandler(async (req, res) => {
    const { WelfareScheme } = await import('../models/index.js');
    
    const { category } = req.query;
    const query = { status: 'active' };
    if (category) query.category = category;
    
    const schemes = await WelfareScheme.find(query)
      .select('name code description category eligibilityCriteria benefits startDate endDate status currentBeneficiaries maxBeneficiaries ministry department')
      .sort({ name: 1 });
    
    return successResponse(res, schemes);
  })
);

// ============================================================================
// WORKER REQUEST ROUTES - Employer sends request, worker accepts/rejects
// ============================================================================

/**
 * @route POST /api/employers/profile/workers/request
 * @desc Send a worker add request by mobile number
 * @access Private (Employer)
 */
router.post(
  '/profile/workers/request',
  authenticate,
  [
    body('phone').notEmpty().withMessage('Mobile number is required')
      .matches(/^[+]?[\d\s-]{10,15}$/).withMessage('Invalid mobile number format'),
    body('message').optional().isString().isLength({ max: 500 })
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { WorkerRequest } = await import('../models/index.js');
    
    const employer = await findEmployerByUserId(req.user.id);
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const { phone, message } = req.body;

    // Normalize phone number (strip spaces, dashes)
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    const corePhone = normalizedPhone.replace(/^\+91/, '').replace(/^0/, '');
    
    // Create a regex that allows any non-digit characters between the digits
    // This handles DB entries like "+91 98765 43210" or "987-654-3210"
    const phoneRegexString = corePhone.split('').join('\\D*');

    // Find worker by phone number
    const worker = await Worker.findOne({ 
      phone: { $regex: phoneRegexString, $options: 'i' }
    });

    if (!worker) {
      // Also try searching in User model
      const workerUser = await User.findOne({ 
        phone: { $regex: phoneRegexString, $options: 'i' },
        role: ROLES.WORKER 
      });

      if (!workerUser) {
        return errorResponse(res, 'No worker found with this mobile number. Please ensure the worker is registered on the platform.', 404);
      }

      // Find worker profile from user
      const workerProfile = await Worker.findOne({ userId: workerUser._id });
      if (!workerProfile) {
        return errorResponse(res, 'Worker profile not found for this user.', 404);
      }

      // Check if request already exists
      const existingRequest = await WorkerRequest.findOne({
        employerId: employer._id,
        workerId: workerProfile._id,
        status: 'pending'
      });

      if (existingRequest) {
        return errorResponse(res, 'A pending request already exists for this worker.', 409);
      }

      // Check if worker is already linked (accepted request exists)
      const acceptedRequest = await WorkerRequest.findOne({
        employerId: employer._id,
        workerId: workerProfile._id,
        status: 'accepted'
      });

      if (acceptedRequest) {
        return errorResponse(res, 'This worker is already added to your team.', 409);
      }

      // Create the request
      const request = await WorkerRequest.create({
        employerId: employer._id,
        employerUserId: req.user.id,
        workerId: workerProfile._id,
        workerUserId: workerUser._id,
        employerName: employer.companyName || req.user.name,
        workerName: workerProfile.name || workerUser.name,
        workerPhone: normalizedPhone,
        message
      });

      logger.info('Worker request sent', { 
        employerId: employer._id, 
        workerId: workerProfile._id,
        requestId: request._id 
      });

      return successResponse(res, { request }, 'Worker request sent successfully. The worker will be notified.', 201);
    }

    // Worker found directly by phone
    // Check if request already exists
    const existingRequest = await WorkerRequest.findOne({
      employerId: employer._id,
      workerId: worker._id,
      status: 'pending'
    });

    if (existingRequest) {
      return errorResponse(res, 'A pending request already exists for this worker.', 409);
    }

    // Check if worker is already linked
    const acceptedRequest = await WorkerRequest.findOne({
      employerId: employer._id,
      workerId: worker._id,
      status: 'accepted'
    });

    if (acceptedRequest) {
      return errorResponse(res, 'This worker is already added to your team.', 409);
    }

    // Create the request
    const request = await WorkerRequest.create({
      employerId: employer._id,
      employerUserId: req.user.id,
      workerId: worker._id,
      workerUserId: worker.userId,
      employerName: employer.companyName || req.user.name,
      workerName: worker.name,
      workerPhone: normalizedPhone,
      message
    });

    logger.info('Worker request sent', { 
      employerId: employer._id, 
      workerId: worker._id,
      requestId: request._id 
    });

    return successResponse(res, { request }, 'Worker request sent successfully. The worker will be notified.', 201);
  })
);

/**
 * @route GET /api/employers/profile/workers/requests
 * @desc Get all worker requests sent by current employer
 * @access Private (Employer)
 */
router.get(
  '/profile/workers/requests',
  authenticate,
  asyncHandler(async (req, res) => {
    const { WorkerRequest } = await import('../models/index.js');
    
    const employer = await findEmployerByUserId(req.user.id);
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const { status } = req.query;
    const filter = { employerId: employer._id };
    if (status && ['pending', 'accepted', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const requests = await WorkerRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('workerId', 'name phone')
      .lean();

    return successResponse(res, { requests });
  })
);

/**
 * @route DELETE /api/employers/profile/workers/requests/:requestId
 * @desc Cancel a pending worker request
 * @access Private (Employer)
 */
router.delete(
  '/profile/workers/requests/:requestId',
  authenticate,
  validateObjectId('requestId'),
  asyncHandler(async (req, res) => {
    const { WorkerRequest } = await import('../models/index.js');
    
    const employer = await findEmployerByUserId(req.user.id);
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const request = await WorkerRequest.findOne({
      _id: req.params.requestId,
      employerId: employer._id,
      status: 'pending'
    });

    if (!request) {
      return notFoundResponse(res, 'Pending request not found');
    }

    await WorkerRequest.findByIdAndDelete(request._id);

    logger.info('Worker request cancelled', { 
      employerId: employer._id, 
      requestId: request._id 
    });

    return successResponse(res, null, 'Worker request cancelled');
  })
);

/**
 * @route PUT /api/employers/profile/workers/requests/:requestId/read
 * @desc Mark a request notification as read (employer side)
 * @access Private (Employer)
 */
router.put(
  '/profile/workers/requests/:requestId/read',
  authenticate,
  validateObjectId('requestId'),
  asyncHandler(async (req, res) => {
    const { WorkerRequest } = await import('../models/index.js');
    
    const request = await WorkerRequest.findOneAndUpdate(
      { _id: req.params.requestId, employerUserId: req.user.id },
      { employerNotificationRead: true },
      { new: true }
    );

    if (!request) {
      return notFoundResponse(res, 'Request not found');
    }

    return successResponse(res, { request }, 'Notification marked as read');
  })
);

/**
 * @route GET /api/employers/profile/notifications
 * @desc Get employer notifications (unread request responses)
 * @access Private (Employer)
 */
router.get(
  '/profile/notifications',
  authenticate,
  asyncHandler(async (req, res) => {
    const { WorkerRequest } = await import('../models/index.js');
    
    const employer = await findEmployerByUserId(req.user.id);
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    // Get responded requests where employer hasn't read the notification
    const notifications = await WorkerRequest.find({
      employerId: employer._id,
      status: { $in: ['accepted', 'rejected'] },
      employerNotificationRead: false
    })
      .sort({ respondedAt: -1 })
      .populate('workerId', 'name phone')
      .lean();

    return successResponse(res, { 
      notifications,
      unreadCount: notifications.length 
    });
  })
);

export default router;

