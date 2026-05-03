/**
 * Worker Routes
 */
import { Router } from 'express';
import { body } from 'express-validator';
import * as workerController from '../controllers/worker.controller.js';
import * as welfareClassificationController from '../controllers/welfareClassification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, govOnly, adminOnly } from '../middleware/role.middleware.js';
import { validate, validateObjectId, validatePagination } from '../middleware/validation.middleware.js';
import {
  createWorkerValidator,
  updateWorkerValidator,
  verifyWorkerValidator,
  workerIdHashValidator,
  workerQueryValidator
} from '../validators/worker.validator.js';
import { ROLES } from '../config/constants.js';

const router = Router();

const findWorkerByUserId = async (userId) => {
  let worker = await Worker.findOne({ userId });
  if (!worker) {
    worker = await Worker.findOne({ user: userId });
    if (worker && !worker.userId) {
      worker.userId = userId;
      await worker.save();
    }
  }
  return worker;
};

/**
 * @route GET /api/workers/profile
 * @desc Get current worker's profile
 * @access Private (Worker)
 */
router.get(
  '/profile',
  authenticate,
  workerController.getMyProfile
);

/**
 * @route PUT /api/workers/profile
 * @desc Update current worker's profile
 * @access Private (Worker)
 */
router.put(
  '/profile',
  authenticate,
  workerController.updateMyProfile
);

/**
 * @route GET /api/workers/profile/dashboard
 * @desc Get current worker's dashboard data (earnings, monthly income, income by source)
 * @access Private (Worker)
 */
router.get(
  '/profile/dashboard',
  authenticate,
  workerController.getMyDashboard
);

/**
 * @route GET /api/workers/profile/welfare
 * @desc Get current worker's welfare/BPL status
 * @access Private (Worker)
 */
router.get(
  '/profile/welfare',
  authenticate,
  workerController.getMyWelfareStatus
);

/**
 * @route GET /api/workers/profile/welfare-classification
 * @desc Get current AI-based welfare classification
 * @access Private (Worker)
 */
router.get(
  '/profile/welfare-classification',
  authenticate,
  welfareClassificationController.getCurrentClassification
);

/**
 * @route GET /api/workers/profile/welfare-classification/history
 * @desc Get classification history
 * @access Private (Worker)
 */
router.get(
  '/profile/welfare-classification/history',
  authenticate,
  welfareClassificationController.getClassificationHistory
);

/**
 * @route POST /api/workers/profile/welfare-classification/attempt
 * @desc Attempt new APL/BPL classification (max 6 per year)
 * @access Private (Worker)
 */
router.post(
  '/profile/welfare-classification/attempt',
  authenticate,
  welfareClassificationController.attemptClassification
);

/**
 * @route GET /api/workers/profile/welfare-classification/attempts-remaining
 * @desc Get number of classification attempts remaining this year
 * @access Private (Worker)
 */
router.get(
  '/profile/welfare-classification/attempts-remaining',
  authenticate,
  welfareClassificationController.getAttemptsRemaining
);

/**
 * @route GET /api/workers/profile/income
 * @desc Get current worker's income summary
 * @access Private (Worker)
 */
router.get(
  '/profile/income',
  authenticate,
  workerController.getMyIncomeSummary
);

/**
 * @route GET /api/workers/profile/transactions
 * @desc Get current worker's transactions
 * @access Private (Worker)
 */
router.get(
  '/profile/transactions',
  authenticate,
  validatePagination,
  workerController.getMyTransactions
);


/**
 * @route GET /api/workers/profile/bank-accounts
 * @desc Get current worker's bank accounts
 * @access Private (Worker)
 */
router.get(
  '/profile/bank-accounts',
  authenticate,
  workerController.getMyBankAccounts
);

/**
 * @route POST /api/workers/profile/bank-accounts
 * @desc Add a bank account to current worker's profile
 * @access Private (Worker)
 */
router.post(
  '/profile/bank-accounts',
  authenticate,
  [
    body('accountNumber').notEmpty().withMessage('Account number is required'),
    body('accountHolderName').notEmpty().withMessage('Account holder name is required'),
    body('bankName').notEmpty().withMessage('Bank name is required'),
    body('ifscCode').matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),
    body('country').optional().isIn(['IN', 'US', 'GB', 'AU', 'CA', 'NZ']).withMessage('Invalid country code'),
    body('accountType').optional().isIn(['savings', 'current', 'other']),
    body('isDefault').optional().isBoolean()
  ],
  validate,
  workerController.addBankAccount
);

/**
 * @route PUT /api/workers/profile/bank-accounts/:accountId
 * @desc Update a bank account
 * @access Private (Worker)
 */
router.put(
  '/profile/bank-accounts/:accountId',
  authenticate,
  workerController.updateBankAccount
);

/**
 * @route DELETE /api/workers/profile/bank-accounts/:accountId
 * @desc Delete a bank account
 * @access Private (Worker)
 */
router.delete(
  '/profile/bank-accounts/:accountId',
  authenticate,
  workerController.deleteBankAccount
);

/**
 * @route PUT /api/workers/profile/bank-accounts/:accountId/default
 * @desc Set a bank account as default
 * @access Private (Worker)
 */
router.put(
  '/profile/bank-accounts/:accountId/default',
  authenticate,
  workerController.setDefaultBankAccount
);

/**
 * @route POST /api/workers
 * @desc Create a new worker
 * @access Private (Admin, Government)
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.GOVERNMENT),
  createWorkerValidator,
  validate,
  workerController.createWorker
);

/**
 * @route GET /api/workers
 * @desc Get all workers with pagination
 * @access Private (Admin, Government, Employer)
 */
router.get(
  '/',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.GOVERNMENT, ROLES.EMPLOYER),
  workerQueryValidator,
  validatePagination,
  workerController.getWorkers
);

/**
 * @route GET /api/workers/bpl
 * @desc Get BPL workers
 * @access Private (Government, Admin)
 */
router.get(
  '/bpl',
  authenticate,
  govOnly,
  validatePagination,
  workerController.getBPLWorkers
);

/**
 * @route GET /api/workers/hash/:idHash
 * @desc Get worker by ID hash
 * @access Private
 */
router.get(
  '/hash/:idHash',
  authenticate,
  workerIdHashValidator,
  validate,
  workerController.getWorkerByIdHash
);

// ============================================================================
// QR CODE ROUTES - MUST BE DEFINED BEFORE /:id ROUTES TO AVOID CONFLICTS
// ============================================================================

/**
 * @route POST /api/workers/qr/generate
 * @desc Generate QR code for bank account
 * @access Private (Worker)
 */
router.post(
  '/qr/generate',
  authenticate,
  body('accountId').notEmpty().withMessage('Account ID is required'),
  validate,
  workerController.generateQRForAccount
);

/**
 * @route POST /api/workers/qr/verify
 * @desc Verify QR token and get recipient details
 * @access Public
 */
router.post(
  '/qr/verify',
  body('token').notEmpty().withMessage('QR token is required'),
  validate,
  workerController.verifyQRToken
);

/**
 * @route POST /api/workers/qr/deposit
 * @desc Process payment deposit via QR code
 * @access Public
 */
router.post(
  '/qr/deposit',
  body('token').notEmpty().withMessage('QR token is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('payerName').notEmpty().withMessage('Payer name is required'),
  body('payerIdHash').notEmpty().withMessage('Sender account required - please log in'),
  body('payerAccountId').notEmpty().withMessage('Sender account required - please log in'),
  body('payerPhone').optional().isString(),
  validate,
  workerController.depositViaQR
);

// ============================================================================
// WELFARE SCHEMES ROUTE - MUST BE BEFORE /:id ROUTES
// ============================================================================

/**
 * @route GET /api/workers/welfare-schemes
 * @desc Get active welfare schemes with personalized eligibility for logged-in worker
 * @access Private (Worker)
 */
router.get(
  '/welfare-schemes',
  authenticate,
  async (req, res) => {
    try {
      const { WelfareScheme } = await import('../models/index.js');
      const { Worker: WorkerModel } = await import('../models/index.js');
      const { successResponse } = await import('../utils/response.util.js');
      
      const { category } = req.query;
      const query = { status: 'active' };
      if (category) query.category = category;
      
      const schemes = await WelfareScheme.find(query)
        .select('name code description category eligibilityCriteria benefits startDate endDate status currentBeneficiaries maxBeneficiaries ministry department')
        .sort({ name: 1 });

      // Get the current worker's eligibleSchemes list
      const worker = await WorkerModel.findOne({ userId: req.user.id }).select('eligibleSchemes');
      const workerEligibleCodes = worker?.eligibleSchemes || [];

      // Annotate each scheme with whether this worker is eligible
      const annotatedSchemes = schemes.map(s => {
        const obj = s.toJSON();
        obj.isEligible = workerEligibleCodes.includes(s.code);
        return obj;
      });
      
      return successResponse(res, annotatedSchemes);
    } catch (error) {
      const { errorResponse } = await import('../utils/response.util.js');
      return errorResponse(res, error.message, 500);
    }
  }
);

// ============================================================================
// WORKER ID ROUTES - These use /:id parameter, must come AFTER specific routes
// ============================================================================

/**
 * @route GET /api/workers/:id
 * @desc Get worker by ID
 * @access Private
 */
router.get(
  '/:id',
  authenticate,
  validateObjectId('id'),
  workerController.getWorkerById
);

/**
 * @route PUT /api/workers/:id
 * @desc Update worker
 * @access Private (Self, Admin)
 */
router.put(
  '/:id',
  authenticate,
  updateWorkerValidator,
  validate,
  workerController.updateWorker
);

/**
 * @route POST /api/workers/:id/verify
 * @desc Verify worker
 * @access Private (Government)
 */
router.post(
  '/:id/verify',
  authenticate,
  govOnly,
  verifyWorkerValidator,
  validate,
  workerController.verifyWorker
);

/**
 * @route GET /api/workers/:id/income
 * @desc Get worker income summary
 * @access Private
 */
router.get(
  '/:id/income',
  authenticate,
  validateObjectId('id'),
  workerController.getWorkerIncomeSummary
);

/**
 * @route GET /api/workers/:id/transactions
 * @desc Get worker transactions
 * @access Private
 */
router.get(
  '/:id/transactions',
  authenticate,
  validateObjectId('id'),
  validatePagination,
  workerController.getWorkerTransactions
);

/**
 * @route DELETE /api/workers/:id
 * @desc Delete (deactivate) worker
 * @access Private (Admin)
 */
router.delete(
  '/:id',
  authenticate,
  adminOnly,
  validateObjectId('id'),
  workerController.deleteWorker
);

// ============================================================================
// WORKER REQUEST ROUTES - Worker receives/responds to employer requests
// ============================================================================

/**
 * @route GET /api/workers/profile/requests
 * @desc Get all incoming worker requests for the current worker
 * @access Private (Worker)
 */
router.get(
  '/profile/requests',
  authenticate,
  async (req, res) => {
    try {
      const { WorkerRequest } = await import('../models/index.js');
      const { Worker: WorkerModel } = await import('../models/index.js');
      const { successResponse, notFoundResponse } = await import('../utils/response.util.js');
      
      const worker = await findWorkerByUserId(req.user.id);
      if (!worker) {
        return notFoundResponse(res, 'Worker profile not found');
      }

      const { status } = req.query;
      const filter = { workerId: worker._id };
      if (status && ['pending', 'accepted', 'rejected'].includes(status)) {
        filter.status = status;
      }

      const requests = await WorkerRequest.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      return successResponse(res, { requests });
    } catch (error) {
      const { errorResponse } = await import('../utils/response.util.js');
      return errorResponse(res, error.message, 500);
    }
  }
);

/**
 * @route PUT /api/workers/profile/requests/:requestId/respond
 * @desc Accept or reject a worker request
 * @access Private (Worker)
 */
router.put(
  '/profile/requests/:requestId/respond',
  authenticate,
  async (req, res) => {
    try {
      const { WorkerRequest } = await import('../models/index.js');
      const { Worker: WorkerModel } = await import('../models/index.js');
      const { successResponse, notFoundResponse, errorResponse } = await import('../utils/response.util.js');
      
      const worker = await findWorkerByUserId(req.user.id);
      if (!worker) {
        return notFoundResponse(res, 'Worker profile not found');
      }

      const { action } = req.body;
      if (!action || !['accept', 'reject'].includes(action)) {
        return errorResponse(res, 'Invalid action. Must be "accept" or "reject".', 400);
      }

      const request = await WorkerRequest.findOne({
        _id: req.params.requestId,
        workerId: worker._id,
        status: 'pending'
      });

      if (!request) {
        return notFoundResponse(res, 'Pending request not found');
      }

      request.status = action === 'accept' ? 'accepted' : 'rejected';
      request.respondedAt = new Date();
      request.workerNotificationRead = true;
      // Reset employer notification so they get notified of the response
      request.employerNotificationRead = false;
      await request.save();

      // If accepted, update the worker's currentEmployerId
      if (action === 'accept') {
        const { Employer } = await import('../models/index.js');
        worker.currentEmployerId = request.employerId;
        await worker.save();

        // Update employer worker count
        const acceptedCount = await WorkerRequest.countDocuments({
          employerId: request.employerId,
          status: 'accepted'
        });
        await Employer.findByIdAndUpdate(request.employerId, {
          activeWorkers: acceptedCount,
          totalWorkers: acceptedCount
        });
      }

      const statusText = action === 'accept' ? 'accepted' : 'rejected';
      return successResponse(res, { request }, `Worker request ${statusText} successfully`);
    } catch (error) {
      const { errorResponse } = await import('../utils/response.util.js');
      return errorResponse(res, error.message, 500);
    }
  }
);

/**
 * @route GET /api/workers/profile/notifications
 * @desc Get worker notifications (pending requests count)
 * @access Private (Worker)
 */
router.get(
  '/profile/notifications',
  authenticate,
  async (req, res) => {
    try {
      const { WorkerRequest } = await import('../models/index.js');
      const { Worker: WorkerModel } = await import('../models/index.js');
      const { successResponse, notFoundResponse } = await import('../utils/response.util.js');
      
      const worker = await findWorkerByUserId(req.user.id);
      if (!worker) {
        return notFoundResponse(res, 'Worker profile not found');
      }

      const pendingRequests = await WorkerRequest.find({
        workerId: worker._id,
        status: 'pending',
        workerNotificationRead: false
      })
        .sort({ createdAt: -1 })
        .lean();

      return successResponse(res, { 
        notifications: pendingRequests,
        unreadCount: pendingRequests.length 
      });
    } catch (error) {
      const { errorResponse } = await import('../utils/response.util.js');
      return errorResponse(res, error.message, 500);
    }
  }
);

export default router;

