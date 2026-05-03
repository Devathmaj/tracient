/**
 * Blockchain Routes
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { govOrAdmin, adminOnly } from '../middleware/role.middleware.js';
import { validate, validateObjectId } from '../middleware/validation.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { successResponse } from '../utils/response.util.js';
import { body, query, param } from 'express-validator';
import fabricService from '../services/fabric.service.js';
import blockchainSyncService from '../services/blockchain-sync.service.js';
import { WageRecord, Worker } from '../models/index.js';
import { ROLES } from '../config/constants.js';
import { logger } from '../utils/logger.util.js';
import { 
  submitTransaction, 
  evaluateTransaction, 
  getConnectionStatus,
  isFabricConnected,
  FABRIC_CONFIG
} from '../config/fabric.js';

const router = Router();

/**
 * @route GET /api/blockchain/status
 * @desc Get blockchain network status
 * @access Private
 */
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const status = await fabricService.getNetworkStatus();
    const syncStatus = blockchainSyncService.getSyncStatus();
    
    return successResponse(res, { 
      status,
      sync: syncStatus
    }, 'Blockchain status retrieved');
  })
);

/**
 * @route GET /api/blockchain/health
 * @desc Quick health check for blockchain connection
 * @access Public
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const status = await fabricService.getNetworkStatus();
    return successResponse(res, {
      healthy: status.healthy || false,
      connected: status.connected || false,
      chaincode: status.chaincode || null,
      channel: status.channel || null
    }, 'Health check completed');
  })
);

/**
 * @route GET /api/blockchain/sync/status
 * @desc Get blockchain sync status and statistics
 * @access Private
 */
router.get(
  '/sync/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const syncStatus = blockchainSyncService.getSyncStatus();
    const statistics = await blockchainSyncService.getSyncStatistics();
    
    return successResponse(res, {
      status: syncStatus,
      statistics
    }, 'Sync status retrieved');
  })
);

/**
 * @route GET /api/blockchain/transaction/:transactionId
 * @desc Get transaction details from blockchain
 * @access Private
 */
router.get(
  '/transaction/:transactionId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    
    // First check if we have a local record
    const localRecord = await WageRecord.findOne({ 
      $or: [
        { 'blockchain.transactionId': transactionId },
        { _id: transactionId }
      ]
    });

    if (!localRecord) {
      throw new AppError('Transaction not found', 404);
    }

    // Get blockchain verification
    let blockchainData = null;
    try {
      blockchainData = await fabricService.verifyTransaction(
        localRecord.blockchain?.transactionId || transactionId
      );
    } catch (error) {
      blockchainData = { verified: false, error: error.message };
    }

    return successResponse(res, {
      localRecord: {
        id: localRecord._id,
        amount: localRecord.amount,
        status: localRecord.status,
        paymentDate: localRecord.paymentDate,
        blockchain: localRecord.blockchain
      },
      blockchainData
    }, 'Transaction retrieved');
  })
);

/**
 * @route GET /api/blockchain/worker/:idHash/history
 * @desc Get worker's wage history from blockchain
 * @access Private
 */
router.get(
  '/worker/:idHash/history',
  authenticate,
  asyncHandler(async (req, res) => {
    const { idHash } = req.params;
    const { startDate, endDate } = req.query;

    // Authorization: only the worker themselves, their employer, gov, or admin
    const worker = await Worker.findOne({ idHash });
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    if (req.user.role === ROLES.WORKER && worker.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Get history from blockchain
    let blockchainHistory = [];
    try {
      blockchainHistory = await fabricService.getWorkerWageHistory(idHash, startDate, endDate);
    } catch (error) {
      // Fallback to local database
      const filter = { worker: worker._id };
      if (startDate || endDate) {
        filter.paymentDate = {};
        if (startDate) filter.paymentDate.$gte = new Date(startDate);
        if (endDate) filter.paymentDate.$lte = new Date(endDate);
      }
      
      const localHistory = await WageRecord.find(filter)
        .sort({ paymentDate: -1 })
        .limit(100)
        .lean();
      
      blockchainHistory = localHistory.map(tx => ({
        ...tx,
        source: 'local_database',
        blockchainVerified: false
      }));
    }

    return successResponse(res, { 
      idHash,
      history: blockchainHistory,
      count: blockchainHistory.length
    }, 'Worker history retrieved');
  })
);

/**
 * @route POST /api/blockchain/verify
 * @desc Verify a transaction on blockchain
 * @access Private
 */
router.post(
  '/verify',
  authenticate,
  [
    body('transactionId').notEmpty().withMessage('Transaction ID is required'),
    body('transactionHash').optional().isString()
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { transactionId, transactionHash } = req.body;

    const record = await WageRecord.findById(transactionId);
    if (!record) {
      throw new AppError('Transaction not found', 404);
    }

    let verificationResult;
    try {
      verificationResult = await fabricService.verifyTransaction(
        record.blockchain?.transactionId,
        transactionHash || record.transactionHash
      );
    } catch (error) {
      verificationResult = {
        verified: false,
        error: error.message,
        localRecord: {
          status: record.status,
          blockchain: record.blockchain
        }
      };
    }

    return successResponse(res, { verificationResult }, 'Verification complete');
  })
);

/**
 * @route GET /api/blockchain/worker/:idHash/classification
 * @desc Get worker's BPL classification from blockchain
 * @access Private (Government, Admin)
 */
router.get(
  '/worker/:idHash/classification',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const { idHash } = req.params;

    const worker = await Worker.findOne({ idHash });
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    let blockchainClassification;
    try {
      blockchainClassification = await fabricService.evaluateTransaction(
        'GetWorkerClassification',
        idHash
      );
    } catch (error) {
      // Fallback to local data
      blockchainClassification = {
        source: 'local_database',
        ...worker.bplClassification
      };
    }

    return successResponse(res, {
      idHash,
      classification: blockchainClassification,
      localData: worker.bplClassification
    }, 'Classification retrieved');
  })
);

/**
 * @route POST /api/blockchain/sync
 * @desc Sync local records with blockchain (admin only)
 * @access Private (Admin)
 */
router.post(
  '/sync',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const result = await blockchainSyncService.syncPendingWages();
    return successResponse(res, { result }, 'Sync operation completed');
  })
);

/**
 * @route POST /api/blockchain/sync/retry
 * @desc Retry failed blockchain syncs
 * @access Private (Admin/Gov)
 */
router.post(
  '/sync/retry',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const result = await blockchainSyncService.retryFailedSyncs();
    return successResponse(res, { result }, 'Retry operation completed');
  })
);

/**
 * @route POST /api/blockchain/sync/force/:wageId
 * @desc Force sync a specific wage record
 * @access Private (Admin/Gov)
 */
router.post(
  '/sync/force/:wageId',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    const { wageId } = req.params;
    const result = await blockchainSyncService.forceSyncWage(wageId);
    
    if (!result.success) {
      throw new AppError(result.error || 'Failed to sync wage', 400);
    }
    
    return successResponse(res, { result }, 'Wage synced successfully');
  })
);

/**
 * @route GET /api/blockchain/worker/:idHash/poverty-status
 * @desc Get worker's poverty status from blockchain
 * @access Private
 */
router.get(
  '/worker/:idHash/poverty-status',
  authenticate,
  asyncHandler(async (req, res) => {
    const { idHash } = req.params;
    const { state } = req.query;

    const worker = await Worker.findOne({ idHash });
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    // Authorization check
    if (req.user.role === ROLES.WORKER && worker.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Get current year date range
    const now = new Date();
    const startDate = new Date(now.getFullYear(), 0, 1).toISOString();
    const endDate = now.toISOString();

    const result = await fabricService.checkPovertyStatus(idHash, state || 'DEFAULT', startDate, endDate);
    
    return successResponse(res, {
      idHash,
      povertyStatus: result.data || null,
      localData: worker.bplClassification
    }, 'Poverty status retrieved');
  })
);

/**
 * @route GET /api/blockchain/thresholds
 * @desc Get poverty thresholds
 * @access Private
 */
router.get(
  '/thresholds',
  authenticate,
  asyncHandler(async (req, res) => {
    const { state } = req.query;
    
    const bplThreshold = await fabricService.getPovertyThreshold(state || 'DEFAULT', 'BPL');
    const aplThreshold = await fabricService.getPovertyThreshold(state || 'DEFAULT', 'APL');
    
    return successResponse(res, {
      bpl: bplThreshold.data,
      apl: aplThreshold.data
    }, 'Thresholds retrieved');
  })
);

/**
 * @route GET /api/blockchain/analytics
 * @desc Get blockchain analytics
 * @access Private (Government, Admin)
 */
router.get(
  '/analytics',
  authenticate,
  govOrAdmin,
  asyncHandler(async (req, res) => {
    // Get local statistics about blockchain-recorded transactions
    const analytics = await WageRecord.aggregate([
      {
        $group: {
          _id: '$blockchain.recordedOnChain',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const stats = {
      onChain: analytics.find(a => a._id === true) || { count: 0, totalAmount: 0 },
      offChain: analytics.find(a => a._id !== true) || { count: 0, totalAmount: 0 }
    };

    stats.syncRate = stats.onChain.count / (stats.onChain.count + stats.offChain.count) * 100 || 0;

    return successResponse(res, { analytics: stats }, 'Blockchain analytics retrieved');
  })
);

// ============================================================================
// BLOCKCHAIN TESTING ENDPOINTS (Admin Only)
// ============================================================================

/**
 * Chaincode function definitions for testing UI
 */
const CHAINCODE_FUNCTIONS = {
  // Read Operations (evaluateTransaction)
  read: [
    {
      name: 'ReadWage',
      description: 'Read a wage record by ID',
      params: [{ name: 'wageID', type: 'string', required: true, example: 'WAGE001' }]
    },
    {
      name: 'WageExists',
      description: 'Check if a wage record exists',
      params: [{ name: 'wageID', type: 'string', required: true, example: 'WAGE001' }]
    },
    {
      name: 'QueryWagesByWorker',
      description: 'Get all wages for a worker',
      params: [{ name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' }]
    },
    {
      name: 'QueryWagesByEmployer',
      description: 'Get all wages paid by an employer',
      params: [{ name: 'employerIDHash', type: 'string', required: true, example: 'employer-001' }]
    },
    {
      name: 'QueryWageHistory',
      description: 'Get history of a wage record',
      params: [{ name: 'wageID', type: 'string', required: true, example: 'WAGE001' }]
    },
    {
      name: 'CalculateTotalIncome',
      description: 'Calculate total income for a worker in a date range',
      params: [
        { name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' },
        { name: 'startDate', type: 'string', required: true, example: '2025-01-01' },
        { name: 'endDate', type: 'string', required: true, example: '2025-12-31' }
      ]
    },
    {
      name: 'GetWorkerIncomeHistory',
      description: 'Get monthly income history for a worker',
      params: [
        { name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' },
        { name: 'months', type: 'number', required: true, example: 12 }
      ]
    },
    {
      name: 'GetPovertyThreshold',
      description: 'Get poverty threshold for a state',
      params: [
        { name: 'state', type: 'string', required: true, example: 'DEFAULT' },
        { name: 'category', type: 'string', required: true, example: 'BPL' }
      ]
    },
    {
      name: 'CheckPovertyStatus',
      description: 'Check poverty status (BPL/APL) for a worker',
      params: [
        { name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' },
        { name: 'state', type: 'string', required: true, example: 'Maharashtra' },
        { name: 'startDate', type: 'string', required: false, example: '2025-01-01' },
        { name: 'endDate', type: 'string', required: false, example: '2025-12-31' }
      ]
    },
    {
      name: 'GetUserProfile',
      description: 'Get user profile from blockchain',
      params: [{ name: 'userIDHash', type: 'string', required: true, example: 'user-001' }]
    },
    {
      name: 'UserExists',
      description: 'Check if user exists on blockchain',
      params: [{ name: 'userIDHash', type: 'string', required: true, example: 'user-001' }]
    },
    {
      name: 'VerifyUserRole',
      description: 'Verify if user has a specific role',
      params: [
        { name: 'userIDHash', type: 'string', required: true, example: 'user-001' },
        { name: 'requiredRole', type: 'string', required: true, example: 'worker' }
      ]
    },
    {
      name: 'ReadUPITransaction',
      description: 'Read a UPI transaction by ID',
      params: [{ name: 'txID', type: 'string', required: true, example: 'UPI001' }]
    },
    {
      name: 'UPITransactionExists',
      description: 'Check if UPI transaction exists',
      params: [{ name: 'txID', type: 'string', required: true, example: 'UPI001' }]
    },
    {
      name: 'QueryUPITransactionsByWorker',
      description: 'Get all UPI transactions for a worker',
      params: [{ name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' }]
    }
  ],
  // Write Operations (submitTransaction)
  write: [
    {
      name: 'InitLedger',
      description: 'Initialize ledger with sample data (Admin only)',
      params: [],
      dangerous: true
    },
    {
      name: 'RecordWage',
      description: 'Record a new wage payment',
      params: [
        { name: 'wageID', type: 'string', required: true, example: 'WAGE-TEST-001' },
        { name: 'workerIDHash', type: 'string', required: true, example: 'worker-test-001' },
        { name: 'employerIDHash', type: 'string', required: true, example: 'employer-test-001' },
        { name: 'amount', type: 'number', required: true, example: 5000 },
        { name: 'currency', type: 'string', required: true, example: 'INR' },
        { name: 'jobType', type: 'string', required: true, example: 'construction' },
        { name: 'timestamp', type: 'string', required: true, example: new Date().toISOString() },
        { name: 'policyVersion', type: 'string', required: true, example: '2025-Q4' }
      ]
    },
    {
      name: 'SetPovertyThreshold',
      description: 'Set poverty threshold for a state',
      params: [
        { name: 'state', type: 'string', required: true, example: 'Maharashtra' },
        { name: 'category', type: 'string', required: true, example: 'BPL' },
        { name: 'amount', type: 'string', required: true, example: '35000' },
        { name: 'setBy', type: 'string', required: true, example: 'admin' }
      ],
      dangerous: true
    },
    {
      name: 'RegisterUser',
      description: 'Register a new user on blockchain',
      params: [
        { name: 'userID', type: 'string', required: true, example: 'USER-TEST-001' },
        { name: 'userIDHash', type: 'string', required: true, example: 'user-hash-001' },
        { name: 'role', type: 'string', required: true, example: 'worker' },
        { name: 'orgID', type: 'string', required: true, example: 'Org1MSP' },
        { name: 'name', type: 'string', required: true, example: 'Test User' },
        { name: 'contactHash', type: 'string', required: true, example: 'contact-hash-001' }
      ]
    },
    {
      name: 'UpdateUserStatus',
      description: 'Update user status',
      params: [
        { name: 'userIDHash', type: 'string', required: true, example: 'user-hash-001' },
        { name: 'status', type: 'string', required: true, example: 'active' },
        { name: 'updatedBy', type: 'string', required: true, example: 'admin' }
      ]
    },
    {
      name: 'RecordUPITransaction',
      description: 'Record a UPI transaction',
      params: [
        { name: 'txID', type: 'string', required: true, example: 'UPI-TEST-001' },
        { name: 'workerIDHash', type: 'string', required: true, example: 'worker-001' },
        { name: 'amount', type: 'number', required: true, example: 1000 },
        { name: 'currency', type: 'string', required: true, example: 'INR' },
        { name: 'senderName', type: 'string', required: true, example: 'Test Employer' },
        { name: 'senderPhone', type: 'string', required: true, example: '9876543210' },
        { name: 'transactionRef', type: 'string', required: true, example: 'TXN123456' },
        { name: 'paymentMethod', type: 'string', required: true, example: 'UPI' }
      ]
    },
    {
      name: 'BatchRecordWages',
      description: 'Record multiple wages in a single transaction',
      params: [
        { name: 'wagesJSON', type: 'string', required: true, example: JSON.stringify([{wageID: 'WAGE001', workerIDHash: 'worker-001', amount: 5000}]) }
      ]
    }
  ]
};

/**
 * @route GET /api/blockchain/test/functions
 * @desc Get all available chaincode functions for testing
 * @access Private (Admin only)
 */
router.get(
  '/test/functions',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    logger.info(`[Blockchain Test] Functions list requested by admin: ${req.user.email}`);
    
    return successResponse(res, {
      functions: CHAINCODE_FUNCTIONS,
      config: {
        channel: FABRIC_CONFIG.channelName,
        chaincode: FABRIC_CONFIG.chaincodeName,
        mspId: FABRIC_CONFIG.mspId,
        peerEndpoint: FABRIC_CONFIG.peerEndpoint
      },
      connection: getConnectionStatus()
    }, 'Chaincode functions retrieved');
  })
);

/**
 * @route POST /api/blockchain/test/execute
 * @desc Execute a chaincode function for testing
 * @access Private (Admin only)
 */
router.post(
  '/test/execute',
  authenticate,
  adminOnly,
  [
    body('functionName').notEmpty().withMessage('Function name is required'),
    body('params').isArray().withMessage('Params must be an array'),
    body('type').isIn(['read', 'write']).withMessage('Type must be read or write')
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { functionName, params, type } = req.body;
    
    logger.info(`[Blockchain Test] Executing ${type} function: ${functionName} by ${req.user.email}`);
    logger.info(`[Blockchain Test] Parameters: ${JSON.stringify(params)}`);
    
    if (!isFabricConnected()) {
      logger.error(`[Blockchain Test] Failed: Blockchain not connected`);
      throw new AppError('Blockchain network not connected', 503);
    }

    const startTime = Date.now();
    let result;
    let success = false;
    let errorMessage = null;

    try {
      if (type === 'read') {
        // Execute as evaluate (read-only) - evaluateTransaction already parses JSON
        result = await evaluateTransaction(functionName, ...params);
      } else {
        // Execute as submit (write) - submitTransaction already parses JSON
        result = await submitTransaction(functionName, ...params);
      }
      success = true;
      
      logger.info(`[Blockchain Test] Success: ${functionName} completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      errorMessage = error.message;
      logger.error(`[Blockchain Test] Failed: ${functionName} - ${error.message}`);
      logger.error(`[Blockchain Test] Stack: ${error.stack}`);
    }

    return successResponse(res, {
      functionName,
      type,
      params,
      success,
      result,
      error: errorMessage,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, success ? 'Function executed successfully' : 'Function execution failed');
  })
);

/**
 * @route GET /api/blockchain/test/connection
 * @desc Test blockchain connection with detailed info
 * @access Private (Admin only)
 */
router.get(
  '/test/connection',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    logger.info(`[Blockchain Test] Connection test requested by ${req.user.email}`);
    
    const connectionStatus = getConnectionStatus();
    const tests = [];
    
    // Test 1: Basic connection
    tests.push({
      name: 'Basic Connection',
      status: connectionStatus.connected ? 'passed' : 'failed',
      details: connectionStatus
    });
    
    // Test 2: Read operation
    if (connectionStatus.connected) {
      try {
        const startTime = Date.now();
        const result = await evaluateTransaction('GetPovertyThreshold', 'DEFAULT', 'BPL');
        // evaluateTransaction already returns parsed JSON or string
        logger.info(`[Blockchain Test] GetPovertyThreshold result type: ${typeof result}`);
        
        tests.push({
          name: 'Read Operation (GetPovertyThreshold)',
          status: 'passed',
          executionTime: Date.now() - startTime,
          result: result,
          dataType: typeof result === 'object' ? 'JSON Object' : typeof result
        });
        logger.info(`[Blockchain Test] Read operation passed`);
      } catch (error) {
        tests.push({
          name: 'Read Operation (GetPovertyThreshold)',
          status: 'failed',
          error: error.message
        });
        logger.error(`[Blockchain Test] Read operation failed: ${error.message}`);
      }
    }
    
    // Test 3: Query wages
    if (connectionStatus.connected) {
      try {
        const startTime = Date.now();
        const result = await evaluateTransaction('ReadWage', 'WAGE001');
        // evaluateTransaction already returns parsed JSON or string
        logger.info(`[Blockchain Test] ReadWage result type: ${typeof result}`);
        
        tests.push({
          name: 'Query Wage (ReadWage WAGE001)',
          status: 'passed',
          executionTime: Date.now() - startTime,
          result: result,
          dataType: typeof result === 'object' ? 'JSON Object' : typeof result
        });
        logger.info(`[Blockchain Test] Query wage passed`);
      } catch (error) {
        tests.push({
          name: 'Query Wage (ReadWage WAGE001)',
          status: error.message.includes('not found') ? 'passed (no data)' : 'failed',
          error: error.message
        });
        logger.warn(`[Blockchain Test] Query wage: ${error.message}`);
      }
    }

    const passedCount = tests.filter(t => t.status.includes('passed')).length;
    
    return successResponse(res, {
      overallStatus: passedCount === tests.length ? 'healthy' : 'degraded',
      tests,
      summary: {
        total: tests.length,
        passed: passedCount,
        failed: tests.length - passedCount
      },
      config: {
        channel: FABRIC_CONFIG.channelName,
        chaincode: FABRIC_CONFIG.chaincodeName,
        mspId: FABRIC_CONFIG.mspId
      }
    }, 'Connection tests completed');
  })
);

/**
 * @route GET /api/blockchain/test/logs
 * @desc Get recent blockchain operation logs
 * @access Private (Admin only)
 */
router.get(
  '/test/logs',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { limit = 100 } = req.query;
    
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    
    let logs = [];
    let logSource = '';
    
    // Try dedicated blockchain log file first
    const today = new Date().toISOString().split('T')[0];
    const blockchainLogPath = path.join(process.cwd(), 'logs', `blockchain-${today}.log`);
    
    try {
      const content = await fs.readFile(blockchainLogPath, 'utf-8');
      logs = content
        .split('\n')
        .filter(line => line.trim())
        .slice(-parseInt(limit))
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
      logSource = blockchainLogPath;
    } catch {
      // Fall back to combined.log filtered for blockchain-related entries
      try {
        const combinedLogPath = path.join(process.cwd(), 'logs', 'combined.log');
        const content = await fs.readFile(combinedLogPath, 'utf-8');
        const blockchainKeywords = /blockchain|Fabric|chaincode|UPI transaction recorded|Payment recorded|RecordWage|RecordUPI|InitLedger|Blockchain Test|syncedToBlockchain|verifiedOnChain/i;
        
        logs = content
          .split('\n')
          .filter(line => line.trim() && blockchainKeywords.test(line))
          .slice(-parseInt(limit))
          .map(line => {
            // Parse structured log lines: "2026-03-01 22:10:41 [INFO]: message {metadata}"
            const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\]: (.+)$/);
            if (match) {
              return { timestamp: match[1], level: match[2].toLowerCase(), message: match[3] };
            }
            return { raw: line };
          });
        logSource = combinedLogPath + ' (filtered)';
      } catch (innerError) {
        logger.warn(`[Blockchain Test] Could not read any log file: ${innerError.message}`);
        logSource = 'none';
      }
    }

    return successResponse(res, {
      logs,
      logFile: logSource,
      count: logs.length
    }, 'Logs retrieved');
  })
);

/**
 * @route GET /api/blockchain/test/transactions
 * @desc Get all transactions that are recorded on the blockchain
 * @access Private (Admin only)
 */
router.get(
  '/test/transactions',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, status = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Import UPITransaction and WageRecord models
    const { UPITransaction, WageRecord } = await import('../models/index.js');
    
    // Query on-chain transactions
    const upiQuery = { verifiedOnChain: true };
    if (status === 'pending') {
      upiQuery.verifiedOnChain = false;
    }

    const wageQuery = { verifiedOnChain: true };
    if (status === 'pending') {
      wageQuery.verifiedOnChain = false;
    }
    
    const [upiTotal, wageTotal] = await Promise.all([
      UPITransaction.countDocuments(upiQuery),
      WageRecord.countDocuments(wageQuery)
    ]);

    const upiTransactions = await UPITransaction.find(upiQuery)
      .sort({ createdAt: -1 })
      .populate('workerId', 'name idHash')
      .lean();

    const wageRecords = await WageRecord.find(wageQuery)
      .sort({ createdAt: -1 })
      .populate('workerId', 'name idHash')
      .lean();

    // Format transactions with sender and recipient info
    const upiFormatted = upiTransactions.map(tx => ({
      id: tx._id,
      type: tx.mode === 'QR_SCAN' ? 'QR' : 'UPI',
      txId: tx.blockchainTxId || tx.txId,
      amount: tx.amount,
      currency: tx.currency || 'INR',
      // Sender (who paid)
      senderName: tx.senderName || 'Unknown',
      senderPhone: tx.senderPhone || '',
      senderAccount: tx.senderAccount || '',
      // Recipient (who received)
      recipientName: tx.workerName || tx.workerId?.name || 'Unknown',
      recipientIdHash: tx.workerHash,
      recipientAccount: tx.workerAccount || '',
      // Payment details
      paymentMethod: tx.mode || 'UPI',
      status: tx.status,
      blockchainTxId: tx.blockchainTxId,
      verifiedOnChain: tx.verifiedOnChain,
      transactionRef: tx.transactionRef,
      remarks: tx.remarks || '',
      createdAt: tx.createdAt,
      completedAt: tx.completedAt
    }));

    const wageFormatted = wageRecords.map(wage => ({
      id: wage._id,
      type: 'WAGE',
      txId: wage.blockchainTxId || wage.referenceNumber,
      amount: wage.amount,
      currency: 'INR',
      senderName: wage.incomeSource || 'Employer',
      senderPhone: '',
      senderAccount: '',
      recipientName: wage.workerId?.name || 'Unknown',
      recipientIdHash: wage.workerIdHash,
      recipientAccount: '',
      paymentMethod: wage.paymentMethod || 'wage',
      status: wage.status,
      blockchainTxId: wage.blockchainTxId,
      verifiedOnChain: wage.verifiedOnChain,
      transactionRef: wage.referenceNumber,
      remarks: wage.description || '',
      createdAt: wage.createdAt,
      completedAt: wage.completedAt
    }));

    const transactions = [...upiFormatted, ...wageFormatted]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(skip, skip + parseInt(limit));

    // Summary stats
    const [totalOnChainUpi, totalOnChainWage, totalAllUpi, totalAllWage] = await Promise.all([
      UPITransaction.countDocuments({ verifiedOnChain: true }),
      WageRecord.countDocuments({ verifiedOnChain: true }),
      UPITransaction.countDocuments({}),
      WageRecord.countDocuments({})
    ]);
    const totalOnChain = totalOnChainUpi + totalOnChainWage;
    const totalAll = totalAllUpi + totalAllWage;
    const totalPending = totalAll - totalOnChain;

    // Total amount on chain
    const [upiAmountAgg, wageAmountAgg] = await Promise.all([
      UPITransaction.aggregate([
        { $match: { verifiedOnChain: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      WageRecord.aggregate([
        { $match: { verifiedOnChain: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    const totalAmountOnChain = (upiAmountAgg[0]?.total || 0) + (wageAmountAgg[0]?.total || 0);

    return successResponse(res, {
      transactions,
      summary: {
        totalOnChain,
        totalTransactions: totalAll,
        totalPending,
        totalAmountOnChain,
        syncRate: totalAll > 0 
          ? ((totalOnChain / totalAll) * 100).toFixed(1) + '%' 
          : '0%'
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: upiTotal + wageTotal
      }
    }, 'Blockchain transactions retrieved');
  })
);

/**
 * @route POST /api/blockchain/test/init-ledger
 * @desc Initialize the ledger with sample data
 * @access Private (Admin only)
 */
router.post(
  '/test/init-ledger',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    logger.warn(`[Blockchain Test] InitLedger requested by ${req.user.email}`);
    
    if (!isFabricConnected()) {
      throw new AppError('Blockchain network not connected', 503);
    }

    try {
      await submitTransaction('InitLedger');
      logger.info(`[Blockchain Test] InitLedger completed successfully`);
      
      return successResponse(res, {
        success: true,
        message: 'Ledger initialized with sample data'
      }, 'Ledger initialized');
    } catch (error) {
      logger.error(`[Blockchain Test] InitLedger failed: ${error.message}`);
      throw new AppError(`InitLedger failed: ${error.message}`, 500);
    }
  })
);

/**
 * @route GET /api/blockchain/test/identity
 * @desc Get current blockchain identity info
 * @access Private (Admin only)
 */
router.get(
  '/test/identity',
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    const status = getConnectionStatus();
    
    return successResponse(res, {
      mspId: FABRIC_CONFIG.mspId,
      peerEndpoint: FABRIC_CONFIG.peerEndpoint,
      peerHostAlias: FABRIC_CONFIG.peerHostAlias,
      cryptoPath: FABRIC_CONFIG.cryptoPath,
      connected: status.connected,
      channel: FABRIC_CONFIG.channelName,
      chaincode: FABRIC_CONFIG.chaincodeName
    }, 'Identity info retrieved');
  })
);

/**
 * @route GET /api/blockchain/worker/:idHash/wages
 * @desc Get worker's wages with blockchain verification status
 * @access Private
 */
router.get(
  '/worker/:idHash/wages',
  authenticate,
  asyncHandler(async (req, res) => {
    const { idHash } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    // Authorization check
    const worker = await Worker.findOne({ idHash });
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    if (req.user.role === ROLES.WORKER && worker.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Build query
    const query = { workerIdHash: idHash };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const wages = await WageRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('employerId', 'companyName')
      .lean();

    const total = await WageRecord.countDocuments(query);
    const blockchainVerified = await WageRecord.countDocuments({ ...query, verifiedOnChain: true });

    return successResponse(res, {
      wages,
      blockchainVerified,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }, 'Worker wages retrieved');
  })
);

/**
 * @route GET /api/blockchain/employer/:employerId/wages
 * @desc Get employer's wages with blockchain verification status
 * @access Private
 */
router.get(
  '/employer/:employerId/wages',
  authenticate,
  asyncHandler(async (req, res) => {
    const { employerId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    // Build query
    const query = { employerId };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const wages = await WageRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('workerId', 'name idHash')
      .lean();

    const total = await WageRecord.countDocuments(query);
    const blockchainVerified = await WageRecord.countDocuments({ ...query, verifiedOnChain: true });

    return successResponse(res, {
      wages,
      blockchainVerified,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }, 'Employer wages retrieved');
  })
);

/**
 * @route GET /api/blockchain/worker/:idHash/income
 * @desc Get worker's total income from blockchain
 * @access Private
 */
router.get(
  '/worker/:idHash/income',
  authenticate,
  asyncHandler(async (req, res) => {
    const { idHash } = req.params;
    const { startDate, endDate } = req.query;

    // Authorization check
    const worker = await Worker.findOne({ idHash });
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    if (req.user.role === ROLES.WORKER && worker.user.toString() !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Build date filter
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), 0, 1).toISOString();
    const defaultEndDate = endDate || now.toISOString();

    // Calculate from local database
    const result = await WageRecord.aggregate([
      {
        $match: {
          workerIdHash: idHash,
          status: 'completed',
          createdAt: {
            $gte: new Date(defaultStartDate),
            $lte: new Date(defaultEndDate)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          blockchainVerified: { 
            $sum: { $cond: ['$verifiedOnChain', 1, 0] } 
          }
        }
      }
    ]);

    const data = result[0] || { totalIncome: 0, transactionCount: 0, blockchainVerified: 0 };

    return successResponse(res, {
      totalIncome: data.totalIncome,
      transactionCount: data.transactionCount,
      blockchainVerified: data.blockchainVerified,
      period: `${defaultStartDate.split('T')[0]} to ${defaultEndDate.split('T')[0]}`
    }, 'Worker income retrieved');
  })
);

export default router;
