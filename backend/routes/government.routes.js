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

/**
 * @route POST /api/government/welfare-schemes
 * @desc Create a new welfare scheme
 * @access Private (Government, Admin)
 */
router.post(
  '/welfare-schemes',
  authenticate,
  govOrAdmin,
  [
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('code').notEmpty().trim().withMessage('Code is required'),
    body('description').notEmpty().trim().withMessage('Description is required'),
    body('category').isIn(['food', 'housing', 'education', 'health', 'employment', 'pension', 'skill', 'other']).withMessage('Valid category is required'),
    body('eligibilityCriteria').optional().isObject().withMessage('Eligibility criteria must be an object'),
    body('eligibilityCriteria.incomeCategory').optional().isIn(['BPL', 'APL', 'both']).withMessage('Income category must be BPL, APL, or both'),
    body('eligibilityCriteria.maxAnnualIncome').optional().isNumeric().withMessage('Max annual income must be a number'),
    body('benefits').optional().isObject().withMessage('Benefits must be an object'),
    body('benefits.type').optional().isIn(['cash', 'kind', 'service', 'subsidy', 'mixed']).withMessage('Invalid benefit type'),
    body('benefits.amount').optional().isNumeric().withMessage('Benefit amount must be a number'),
    body('totalBudget').optional().isNumeric().withMessage('Total budget must be a number'),
    body('status').optional().isIn(['draft', 'active', 'suspended', 'closed']).withMessage('Invalid status')
  ],
  validate,
  govController.createWelfareScheme
);

/**
 * @route PUT /api/government/welfare-schemes/:id
 * @desc Update a welfare scheme
 * @access Private (Government, Admin)
 */
router.put(
  '/welfare-schemes/:id',
  authenticate,
  govOrAdmin,
  validateObjectId('id'),
  [
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().isIn(['food', 'housing', 'education', 'health', 'employment', 'pension', 'skill', 'other']),
    body('eligibilityCriteria').optional().isObject(),
    body('eligibilityCriteria.incomeCategory').optional().isIn(['BPL', 'APL', 'both']),
    body('eligibilityCriteria.maxAnnualIncome').optional().isNumeric(),
    body('benefits').optional().isObject(),
    body('totalBudget').optional().isNumeric(),
    body('status').optional().isIn(['draft', 'active', 'suspended', 'closed']),
  ],
  validate,
  govController.updateWelfareScheme
);

/**
 * @route DELETE /api/government/welfare-schemes/:id
 * @desc Delete (close) a welfare scheme
 * @access Private (Government, Admin)
 */
router.delete(
  '/welfare-schemes/:id',
  authenticate,
  govOrAdmin,
  validateObjectId('id'),
  [
    body('hardDelete').optional().isBoolean()
  ],
  validate,
  govController.deleteWelfareScheme
);

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

// ============================================================================
// CLASSIFICATION POLICY MANAGEMENT ROUTES
// ============================================================================

/**
 * @route GET /api/government/classification-policies
 * @desc Get all classification override policies
 * @access Private (Government, Admin)
 */
router.get(
  '/classification-policies',
  authenticate,
  govOrAdmin,
  [
    query('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    query('policyType').optional().isIn(['exclusion_override', 'inclusion_override', 'threshold_override'])
      .withMessage('Invalid policy type')
  ],
  validate,
  govController.getClassificationPolicies
);

/**
 * @route GET /api/government/classification-policies/fields
 * @desc Get available fields for creating policy rules
 * @access Private (Government, Admin)
 */
router.get(
  '/classification-policies/fields',
  authenticate,
  govOrAdmin,
  govController.getPolicyRuleFields
);

/**
 * @route GET /api/government/classification-policies/status
 * @desc Get policy application status (modified, last applied, etc.)
 * @access Private (Government, Admin)
 */
router.get(
  '/classification-policies/status',
  authenticate,
  govOrAdmin,
  govController.getPolicyApplicationStatus
);

/**
 * @route POST /api/government/classification-policies/apply
 * @desc Apply all active policies to existing families (bulk re-screening)
 * @access Private (Government, Admin)
 */
router.post(
  '/classification-policies/apply',
  authenticate,
  govOrAdmin,
  govController.applyClassificationPolicies
);

/**
 * @route GET /api/government/classification-policies/:policyId
 * @desc Get a single classification policy
 * @access Private (Government, Admin)
 */
router.get(
  '/classification-policies/:policyId',
  authenticate,
  govOrAdmin,
  govController.getClassificationPolicy
);

/**
 * @route POST /api/government/classification-policies
 * @desc Create a new classification override policy
 * @access Private (Government, Admin)
 */
router.post(
  '/classification-policies',
  authenticate,
  govOrAdmin,
  [
    body('policyId').notEmpty().trim().withMessage('Policy ID is required'),
    body('name').notEmpty().trim().withMessage('Policy name is required'),
    body('description').optional().isString().trim(),
    body('policyType').isIn(['exclusion_override', 'inclusion_override', 'threshold_override'])
      .withMessage('Valid policy type is required'),
    body('rules').isArray({ min: 1 }).withMessage('At least one rule is required'),
    body('rules.*.field').notEmpty().withMessage('Rule field is required'),
    body('rules.*.operator').isIn([
      'equals', 'not_equals', 'greater_than', 'less_than',
      'greater_than_or_equal', 'less_than_or_equal',
      'contains', 'not_contains', 'is_true', 'is_false'
    ]).withMessage('Valid operator is required'),
    body('ruleLogic').optional().isIn(['AND', 'OR']).withMessage('Rule logic must be AND or OR'),
    body('action').isIn(['reclassify_to_bpl', 'reclassify_to_apl', 'flag_for_review', 'ignore_criterion'])
      .withMessage('Valid action is required'),
    body('targetCriteria').optional().isArray(),
    body('priority').optional().isInt().withMessage('Priority must be an integer'),
    body('effectiveFrom').optional().isISO8601().withMessage('Effective from must be a valid date'),
    body('effectiveUntil').optional().isISO8601().withMessage('Effective until must be a valid date')
  ],
  validate,
  govController.createClassificationPolicy
);

/**
 * @route PUT /api/government/classification-policies/:policyId
 * @desc Update an existing classification policy
 * @access Private (Government, Admin)
 */
router.put(
  '/classification-policies/:policyId',
  authenticate,
  govOrAdmin,
  [
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('policyType').optional().isIn(['exclusion_override', 'inclusion_override', 'threshold_override']),
    body('rules').optional().isArray({ min: 1 }),
    body('ruleLogic').optional().isIn(['AND', 'OR']),
    body('action').optional().isIn(['reclassify_to_bpl', 'reclassify_to_apl', 'flag_for_review', 'ignore_criterion']),
    body('targetCriteria').optional().isArray(),
    body('priority').optional().isInt(),
    body('isActive').optional().isBoolean(),
    body('effectiveFrom').optional().isISO8601(),
    body('effectiveUntil').optional().isISO8601(),
    body('reason').optional().isString().trim()
  ],
  validate,
  govController.updateClassificationPolicy
);

/**
 * @route DELETE /api/government/classification-policies/:policyId
 * @desc Delete (deactivate) a classification policy
 * @access Private (Government, Admin)
 */
router.delete(
  '/classification-policies/:policyId',
  authenticate,
  govOrAdmin,
  [
    body('reason').optional().isString().trim(),
    body('hardDelete').optional().isBoolean()
  ],
  validate,
  govController.deleteClassificationPolicy
);

export default router;
