/**
 * Government Routes
 */
import { Router } from 'express';
import * as govController from '../controllers/government.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, govOnly, adminOnly, govOrAdmin } from '../middleware/role.middleware.js';
import { validate, validateObjectId, validatePagination } from '../middleware/validation.middleware.js';
import { reportLimiter } from '../middleware/rateLimit.middleware.js';
import { body, query } from 'express-validator';
import { ROLES } from '../config/constants.js';

const router = Router();

/**
 * @route GET /api/government/dashboard
 * @desc Get government dashboard statistics
 * @access Private (Government, Admin)
 */
router.get(
  '/dashboard',
  authenticate,
  govOrAdmin,
  govController.getDashboardStats
);

/**
 * @route GET /api/government/verifications/pending
 * @desc Get pending verifications
 * @access Private (Government, Admin)
 */
router.get(
  '/verifications/pending',
  authenticate,
  govOrAdmin,
  validatePagination,
  govController.getPendingVerifications
);

/**
 * @route PUT /api/government/verify/:entityType/:id
 * @desc Verify an entity (worker/employer)
 * @access Private (Government, Admin)
 */
router.put(
  '/verify/:entityType/:id',
  authenticate,
  govOrAdmin,
  [
    body('status').isIn(['verified', 'rejected']).withMessage('Status must be verified or rejected'),
    body('remarks').optional().isString().trim()
  ],
  validate,
  govController.verifyEntity
);

/**
 * @route GET /api/government/income-distribution
 * @desc Get income distribution analytics
 * @access Private (Government, Admin)
 */
router.get(
  '/income-distribution',
  authenticate,
  govOrAdmin,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('region').optional().isString()
  ],
  validate,
  govController.getIncomeDistribution
);

/**
 * @route GET /api/government/bpl-statistics
 * @desc Get BPL statistics
 * @access Private (Government, Admin)
 */
// TODO: Implement getBPLStatistics controller
// router.get(
//   '/bpl-statistics',
//   authenticate,
//   govOrAdmin,
//   govController.getBPLStatistics
// );

/**
 * @route GET /api/government/anomalies
 * @desc Get anomaly alerts
 * @access Private (Government, Admin)
 */
router.get(
  '/anomalies',
  authenticate,
  govOrAdmin,
  validatePagination,
  govController.getAnomalyAlerts
);

/**
 * @route PUT /api/government/anomalies/:id/resolve
 * @desc Resolve an anomaly alert
 * @access Private (Government, Admin)
 */
router.put(
  '/anomalies/:id/resolve',
  authenticate,
  govOrAdmin,
  validateObjectId('id'),
  [
    body('resolution').notEmpty().withMessage('Resolution is required'),
    body('status').isIn(['resolved', 'dismissed', 'escalated']).withMessage('Invalid status')
  ],
  validate,
  govController.resolveAnomaly
);

/**
 * @route GET /api/government/welfare-schemes
 * @desc Get welfare schemes
 * @access Private (Government, Admin)
 */
router.get(
  '/welfare-schemes',
  authenticate,
  govOrAdmin,
  validatePagination,
  govController.getWelfareSchemes
);

// TODO: Implement createWelfareScheme controller
// router.post(
//   '/welfare-schemes',
//   authenticate,
//   govOrAdmin,
//   [
//     body('name').notEmpty().trim().withMessage('Name is required'),
//     body('description').notEmpty().trim().withMessage('Description is required'),
//     body('eligibilityCriteria').isObject().withMessage('Eligibility criteria is required'),
//     body('benefits').isArray().withMessage('Benefits must be an array'),
//     body('budget').optional().isNumeric()
//   ],
//   validate,
//   govController.createWelfareScheme
// );

// TODO: Implement updateWelfareScheme controller
// router.put(
//   '/welfare-schemes/:id',
//   authenticate,
//   govOrAdmin,
//   validateObjectId('id'),
//   [
//     body('name').optional().trim(),
//     body('description').optional().trim(),
//     body('eligibilityCriteria').optional().isObject(),
//     body('benefits').optional().isArray(),
//     body('budget').optional().isNumeric(),
//     body('isActive').optional().isBoolean()
//   ],
//   validate,
//   govController.updateWelfareScheme
// );

// TODO: Implement checkEligibility controller
// router.get(
//   '/eligibility/:workerId',
//   authenticate,
//   govOrAdmin,
//   validateObjectId('workerId'),
//   govController.checkEligibility
// );

/**
 * @route POST /api/government/reports/generate
 * @desc Generate a report
 * @access Private (Government, Admin)
 */
router.post(
  '/reports/generate',
  authenticate,
  govOrAdmin,
  reportLimiter,
  [
    body('reportType').isIn(['income', 'bpl', 'transactions', 'anomalies', 'welfare']).withMessage('Invalid report type'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('filters').optional().isObject()
  ],
  validate,
  govController.generateReport
);

/**
 * @route POST /api/government/run-anomaly-scan
 * @desc Run anomaly detection scan on workers
 * @access Private (Government, Admin)
 */
router.post(
  '/run-anomaly-scan',
  authenticate,
  govOrAdmin,
  [
    body('workerIds').optional().isArray().withMessage('Worker IDs must be an array'),
    body('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
    body('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
    body('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
  ],
  validate,
  govController.runAnomalyScan
);

// TODO: Implement getPolicyConfig and updatePolicyConfig controllers
// router.get(
//   '/policy-config',
//   authenticate,
//   govOrAdmin,
//   govController.getPolicyConfig
// );

// router.put(
//   '/policy-config/:key',
//   authenticate,
//   adminOnly,
//   [
//     body('value').notEmpty().withMessage('Value is required'),
//     body('reason').optional().isString()
//   ],
//   validate,
//   govController.updatePolicyConfig
// );

export default router;
