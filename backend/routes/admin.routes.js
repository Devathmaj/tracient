/**
 * Admin Routes
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { adminOnly, authorizeMinLevel } from '../middleware/role.middleware.js';
import { validate, validateObjectId, validatePagination } from '../middleware/validation.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { successResponse, paginatedResponse } from '../utils/response.util.js';
import { paginateQuery } from '../utils/pagination.util.js';
import { hashPassword } from '../utils/hash.util.js';
import { body, query } from 'express-validator';
import { ROLES } from '../config/constants.js';
import { User, Admin, Worker, Employer, GovOfficial, WageRecord, AuditLog, PolicyConfig } from '../models/index.js';
import { auditLog } from '../utils/logger.util.js';

const router = Router();

const findProfileByUserId = async (Model, userId) => {
  let profile = await Model.findOne({ userId });
  if (!profile) {
    profile = await Model.findOne({ user: userId });
    if (profile && !profile.userId) {
      profile.userId = userId;
      await profile.save();
    }
  }
  return profile;
};

// All routes require admin authentication
router.use(authenticate, adminOnly);

/**
 * @route GET /api/admin/dashboard
 * @desc Get admin dashboard overview
 * @access Private (Admin)
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [
      userStats,
      transactionStats,
      verificationStats,
      recentActivity
    ] = await Promise.all([
      // User counts by role
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      // Transaction summary
      WageRecord.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
          }
        }
      ]),
      // Verification pending counts
      Promise.all([
        Worker.countDocuments({ verificationStatus: 'pending' }),
        Employer.countDocuments({ verificationStatus: 'pending' })
      ]),
      // Recent audit logs
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'email role')
    ]);

    const stats = {
      users: userStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      transactions: transactionStats[0] || { total: 0, totalAmount: 0, completed: 0, pending: 0 },
      pendingVerifications: {
        workers: verificationStats[0],
        employers: verificationStats[1],
        total: verificationStats[0] + verificationStats[1]
      },
      recentActivity
    };

    return successResponse(res, { stats }, 'Dashboard data retrieved');
  })
);

/**
 * @route GET /api/admin/users
 * @desc Get all users
 * @access Private (Admin)
 */
router.get(
  '/users',
  validatePagination,
  asyncHandler(async (req, res) => {
    const { role, status, query: searchQuery } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (searchQuery) {
      filter.$or = [
        { email: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    const { data, pagination } = await paginateQuery(User, filter, req.query, {
      select: '-password -refreshTokens',
      defaultSort: '-createdAt'
    });

    return paginatedResponse(res, data, pagination, 'Users retrieved');
  })
);

/**
 * @route GET /api/admin/users/:id
 * @desc Get user by ID
 * @access Private (Admin)
 */
router.get(
  '/users/:id',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password -refreshTokens');
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get associated profile based on role
    let profile = null;
    switch (user.role) {
      case ROLES.WORKER:
        profile = await findProfileByUserId(Worker, user._id);
        break;
      case ROLES.EMPLOYER:
        profile = await findProfileByUserId(Employer, user._id);
        break;
      case ROLES.GOVERNMENT:
        profile = await findProfileByUserId(GovOfficial, user._id);
        break;
      case ROLES.ADMIN:
        profile = await findProfileByUserId(Admin, user._id);
        break;
    }

    return successResponse(res, { user, profile }, 'User retrieved');
  })
);

/**
 * @route POST /api/admin/users
 * @desc Create a new user (admin only)
 * @access Private (Admin - Senior level+)
 */
router.post(
  '/users',
  authorizeMinLevel('senior'),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(Object.values(ROLES)),
    body('profile').optional().isObject()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, role, profile } = req.body;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError('User with this email already exists', 400);
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      isActive: true
    });

    // Create associated profile
    let createdProfile = null;
    switch (role) {
      case ROLES.WORKER:
        createdProfile = await Worker.create({ userId: user._id, ...profile });
        break;
      case ROLES.EMPLOYER:
        createdProfile = await Employer.create({ userId: user._id, ...profile });
        break;
      case ROLES.GOVERNMENT:
        createdProfile = await GovOfficial.create({ userId: user._id, ...profile });
        break;
      case ROLES.ADMIN:
        createdProfile = await Admin.create({ userId: user._id, adminLevel: 'standard', ...profile });
        break;
    }

    await auditLog({
      action: 'admin.createUser',
      userId: req.user.id,
      targetType: 'User',
      targetId: user._id,
      details: { role, email }
    });

    return successResponse(res, { 
      user: { ...user.toObject(), password: undefined },
      profile: createdProfile 
    }, 'User created', 201);
  })
);

/**
 * @route PUT /api/admin/users/:id
 * @desc Update user
 * @access Private (Admin)
 */
router.put(
  '/users/:id',
  validateObjectId('id'),
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(Object.values(ROLES)),
    body('isActive').optional().isBoolean()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const allowedUpdates = ['email', 'isActive'];
    // Only super admin can change roles
    const adminProfile = await Admin.findOne({ user: req.user.id });
    if (adminProfile?.adminLevel === 'super' && req.body.role) {
      allowedUpdates.push('role');
    }

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    await auditLog({
      action: 'admin.updateUser',
      userId: req.user.id,
      targetType: 'User',
      targetId: user._id,
      details: { updates: Object.keys(req.body).filter(k => allowedUpdates.includes(k)) }
    });

    return successResponse(res, { user: { ...user.toObject(), password: undefined } }, 'User updated');
  })
);

/**
 * @route PUT /api/admin/users/:id/reset-password
 * @desc Reset user's password
 * @access Private (Admin - Senior level+)
 */
router.put(
  '/users/:id/reset-password',
  authorizeMinLevel('senior'),
  validateObjectId('id'),
  [
    body('newPassword').isLength({ min: 8 })
  ],
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.password = await hashPassword(req.body.newPassword);
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.refreshTokens = [];
    await user.save();

    await auditLog({
      action: 'admin.resetPassword',
      userId: req.user.id,
      targetType: 'User',
      targetId: user._id,
      details: { passwordReset: true }
    });

    return successResponse(res, null, 'Password reset successfully');
  })
);

/**
 * @route DELETE /api/admin/users/:id
 * @desc Delete/deactivate user
 * @access Private (Admin - Super level)
 */
router.delete(
  '/users/:id',
  authorizeMinLevel('super'),
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    // Soft delete
    user.isActive = false;
    user.refreshTokens = [];
    await user.save();

    await auditLog({
      action: 'admin.deleteUser',
      userId: req.user.id,
      targetType: 'User',
      targetId: user._id,
      details: { softDeleted: true }
    });

    return successResponse(res, null, 'User deactivated');
  })
);

/**
 * @route GET /api/admin/audit-logs
 * @desc Get audit logs
 * @access Private (Admin)
 */
router.get(
  '/audit-logs',
  validatePagination,
  asyncHandler(async (req, res) => {
    const { action, userId, startDate, endDate } = req.query;
    const filter = {};

    if (action) filter.action = { $regex: action, $options: 'i' };
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const { data, pagination } = await paginateQuery(AuditLog, filter, req.query, {
      populate: { path: 'userId', select: 'email role' },
      defaultSort: '-createdAt'
    });

    return paginatedResponse(res, data, pagination, 'Audit logs retrieved');
  })
);

/**
 * @route GET /api/admin/policy-config
 * @desc Get all policy configurations
 * @access Private (Admin)
 */
router.get(
  '/policy-config',
  asyncHandler(async (req, res) => {
    const configs = await PolicyConfig.find({ isActive: true })
      .sort({ category: 1, key: 1 });

    return successResponse(res, { configs }, 'Policy configurations retrieved');
  })
);

/**
 * @route PUT /api/admin/policy-config/:key
 * @desc Update policy configuration
 * @access Private (Admin - Senior level+)
 */
router.put(
  '/policy-config/:key',
  authorizeMinLevel('senior'),
  [
    body('value').notEmpty().withMessage('Value is required'),
    body('reason').optional().isString()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value, reason } = req.body;

    let config = await PolicyConfig.findOne({ key });
    
    if (!config) {
      config = new PolicyConfig({
        key,
        value,
        category: 'general',
        updatedBy: req.user.id
      });
    } else {
      config.previousValue = config.value;
      config.value = value;
      config.updatedBy = req.user.id;
      config.changeHistory.push({
        changedBy: req.user.id,
        previousValue: config.previousValue,
        newValue: value,
        reason,
        changedAt: new Date()
      });
    }

    await config.save();

    await auditLog({
      action: 'admin.updatePolicyConfig',
      userId: req.user.id,
      targetType: 'PolicyConfig',
      targetId: config._id,
      details: { key, value, reason }
    });

    return successResponse(res, { config }, 'Policy configuration updated');
  })
);

/**
 * @route GET /api/admin/system-health
 * @desc Get system health status
 * @access Private (Admin)
 */
router.get(
  '/system-health',
  asyncHandler(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      database: {
        status: 'connected',
        name: 'MongoDB Atlas'
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };

    return successResponse(res, { health }, 'System health retrieved');
  })
);

export default router;
