/**
 * Hyperledger Fabric Service
 * Handles all blockchain interactions
 */
import { 
  submitTransaction, 
  evaluateTransaction, 
  initFabricGateway, 
  getConnectionStatus,
  isFabricConnected,
  isBlockchainEnabled,
  FABRIC_CONFIG
} from '../config/fabric.js';
import { logger } from '../utils/logger.util.js';
import { generateTransactionHash } from '../utils/hash.util.js';

/**
 * Initialize Fabric connection
 */
export const initBlockchain = async () => {
  try {
    await initFabricGateway();
    logger.info('Blockchain service initialized');
    return true;
  } catch (error) {
    logger.error('Failed to initialize blockchain service:', error.message);
    return false;
  }
};

/**
 * Get network status and health
 */
export const getNetworkStatus = async () => {
  try {
    const status = getConnectionStatus();
    
    // If connected, the connection is valid
    // Health check might fail due to IAM restrictions but connection is still valid
    if (status.connected) {
      try {
        // Use GetPovertyThreshold as health check (read-only operation)
        const result = await evaluateTransaction('GetPovertyThreshold', 'DEFAULT', 'BPL');
        logger.info('[Blockchain Health] Connection verified with GetPovertyThreshold query');
        return {
          ...status,
          healthy: true,
          lastCheck: new Date().toISOString(),
          testResult: result || null // evaluateTransaction already parses JSON
        };
      } catch (error) {
        // Check if it's an IAM/access error (means connection works but permissions issue)
        const isAccessError = error.message?.includes('access denied') || 
                             error.message?.includes('ACCESS DENIED') ||
                             error.message?.includes('No role attribute');
        
        if (isAccessError) {
          logger.warn(`[Blockchain Health] Connected but IAM check failed (expected): ${error.message}`);
          return {
            ...status,
            healthy: true, // Connection works, IAM is just enforcing permissions
            iamEnabled: true,
            iamMessage: 'IAM is enabled - role attributes required for chaincode operations',
            lastCheck: new Date().toISOString()
          };
        }
        
        logger.warn(`[Blockchain Health] Health check query failed: ${error.message}`);
        return {
          ...status,
          healthy: false,
          error: error.message,
          lastCheck: new Date().toISOString()
        };
      }
    }
    
    logger.warn('[Blockchain Health] Not connected to Fabric network');
    return {
      ...status,
      healthy: false,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`[Blockchain Health] Status check error: ${error.message}`);
    return {
      connected: false,
      healthy: false,
      error: error.message,
      lastCheck: new Date().toISOString()
    };
  }
};

/**
 * Record a wage payment on the blockchain
 */
export const recordWagePayment = async (wageData) => {
  try {
    const {
      workerIdHash,
      employerIdHash,
      amount,
      referenceNumber,
      timestamp,
      jobType,
      policyVersion
    } = wageData;

    if (!isFabricConnected()) {
      logger.warn('Blockchain not connected - wage recorded in database only');
      return { success: false, mock: true, error: 'Blockchain not connected' };
    }

    const wageId = referenceNumber || `WAGE-${Date.now()}`;
    const txHash = generateTransactionHash({
      workerIdHash,
      employerIdHash,
      amount,
      referenceNumber: wageId
    });

    const result = await submitTransaction(
      'RecordWage',
      wageId,
      workerIdHash,
      employerIdHash,
      amount.toString(),
      'INR',
      jobType || 'labor',
      (timestamp ? new Date(timestamp) : new Date()).toISOString(),
      policyVersion || '2025-Q4'
    );

    logger.info('Wage payment recorded on blockchain', { txHash, workerIdHash, amount });
    return { success: true, txHash, wageId, result };
  } catch (error) {
    logger.error('Failed to record wage on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Register a worker on the blockchain
 */
export const registerWorkerOnChain = async (workerData) => {
  try {
    const { idHash, name, registeredAt } = workerData;
    
    const result = await submitTransaction(
      'RegisterWorker',
      JSON.stringify({
        idHash,
        name,
        registeredAt: registeredAt || new Date().toISOString()
      })
    );
    
    logger.info('Worker registered on blockchain', { idHash });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to register worker on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Register any user on the blockchain with appropriate identity and access
 * This supports admin, government, employer, worker, bank_officer, and auditor roles
 */
export const registerUserOnChain = async (userData) => {
  try {
    const { 
      userId, 
      idHash, 
      name, 
      role, 
      email, 
      phone,
      department,
      designation,
      companyName,
      employeeId,
      clearanceLevel,
      permissions,
      state,
      district,
      registeredAt 
    } = userData;
    
    // Map backend roles to blockchain IAM roles
    const roleMapping = {
      'admin': 'admin',
      'government': 'government_official',
      'employer': 'employer',
      'worker': 'worker',
      'bank_officer': 'bank_officer',
      'auditor': 'auditor'
    };
    
    // Default permissions based on role
    const defaultPermissions = {
      'admin': {
        clearanceLevel: 10,
        permissions: ['canRecordWage', 'canRecordUPI', 'canRegisterUsers', 'canManageUsers', 
                     'canUpdateThresholds', 'canFlagAnomaly', 'canReviewAnomaly', 
                     'canGenerateReport', 'canBatchProcess', 'canReadAll', 'canExport']
      },
      'government_official': {
        clearanceLevel: 8,
        permissions: ['canRegisterUsers', 'canManageUsers', 'canUpdateThresholds',
                     'canFlagAnomaly', 'canReviewAnomaly', 'canGenerateReport', 
                     'canReadAll', 'canExport']
      },
      'auditor': {
        clearanceLevel: 6,
        permissions: ['canFlagAnomaly', 'canReviewAnomaly', 'canGenerateReport', 'canReadAll']
      },
      'bank_officer': {
        clearanceLevel: 5,
        permissions: ['canRecordUPI', 'canGenerateReport']
      },
      'employer': {
        clearanceLevel: 5,
        permissions: ['canRecordWage', 'canRecordUPI', 'canBatchProcess']
      },
      'worker': {
        clearanceLevel: 1,
        permissions: []
      }
    };
    
    const blockchainRole = roleMapping[role] || 'worker';
    const roleDefaults = defaultPermissions[blockchainRole] || defaultPermissions['worker'];
    
    const userPayload = {
      userId: userId?.toString() || idHash,
      userIdHash: idHash,
      role: blockchainRole,
      orgId: 'Org1MSP',
      name: name,
      contactHash: idHash, // Using idHash as contact hash for privacy
      clearanceLevel: clearanceLevel || roleDefaults.clearanceLevel,
      permissions: permissions || roleDefaults.permissions,
      state: state || 'DEFAULT',
      district: district || 'DEFAULT',
      department: department || '',
      designation: designation || '',
      companyName: companyName || '',
      employeeId: employeeId || '',
      email: email || '',
      registeredAt: registeredAt || new Date().toISOString()
    };
    
    // Try to register via RegisterUser chaincode function
    // Chaincode signature: RegisterUser(userID, userIDHash, role, orgID, name, contactHash)
    const result = await submitTransaction(
      'RegisterUser',
      userPayload.userId,
      userPayload.userIdHash,
      userPayload.role,
      userPayload.orgId,
      userPayload.name,
      userPayload.contactHash
    );
    
    logger.info(`User registered on blockchain: ${blockchainRole}`, { 
      userId: userPayload.userId, 
      role: blockchainRole,
      clearanceLevel: userPayload.clearanceLevel
    });
    
    return { 
      success: true, 
      result,
      blockchainIdentity: {
        userId: userPayload.userId,
        role: blockchainRole,
        clearanceLevel: userPayload.clearanceLevel,
        permissions: userPayload.permissions
      }
    };
  } catch (error) {
    logger.error('Failed to register user on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Update user's blockchain identity permissions
 */
export const updateUserPermissions = async (userData) => {
  try {
    const { idHash, permissions, clearanceLevel, status } = userData;
    
    const updatePayload = {
      userIdHash: idHash,
      permissions: permissions || [],
      clearanceLevel: clearanceLevel,
      status: status || 'active',
      updatedAt: new Date().toISOString()
    };
    
    const result = await submitTransaction(
      'UpdateUserPermissions',
      JSON.stringify(updatePayload)
    );
    
    logger.info('User permissions updated on blockchain', { idHash });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to update user permissions on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get user's blockchain identity
 */
export const getUserBlockchainIdentity = async (idHash) => {
  try {
    if (!isFabricConnected()) {
      return { success: false, error: 'Blockchain not connected' };
    }
    
    const result = await evaluateTransaction('GetUserProfile', idHash);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get user blockchain identity:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Update user status on blockchain (activate/suspend)
 */
export const updateUserStatus = async (idHash, status, reason) => {
  try {
    const result = await submitTransaction(
      'UpdateUserStatus',
      JSON.stringify({
        userIdHash: idHash,
        status: status, // 'active', 'suspended', 'revoked'
        reason: reason || '',
        updatedAt: new Date().toISOString()
      })
    );
    
    logger.info('User status updated on blockchain', { idHash, status });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to update user status on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get worker's wage history from blockchain
 */
export const getWorkerWageHistory = async (workerIdHash) => {
  try {
    const result = await evaluateTransaction('GetWorkerWages', workerIdHash);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get worker wage history:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get worker information from blockchain
 */
export const getWorkerFromChain = async (workerIdHash) => {
  try {
    const result = await evaluateTransaction('GetWorker', workerIdHash);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get worker from blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Update worker classification on blockchain
 */
export const updateWorkerClassification = async (workerIdHash, category, annualIncome) => {
  try {
    const result = await submitTransaction(
      'UpdateClassification',
      JSON.stringify({
        workerHash: workerIdHash,
        category,
        annualIncome: annualIncome.toString(),
        updatedAt: new Date().toISOString()
      })
    );
    
    logger.info('Worker classification updated on blockchain', { workerIdHash, category });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to update classification on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Record verification on blockchain
 */
export const recordVerification = async (verificationData) => {
  try {
    const { entityType, entityId, verifiedBy, status, timestamp } = verificationData;
    
    const result = await submitTransaction(
      'RecordVerification',
      JSON.stringify({
        entityType,
        entityId,
        verifiedBy: verifiedBy.toString(),
        status,
        timestamp: timestamp || new Date().toISOString()
      })
    );
    
    logger.info('Verification recorded on blockchain', { entityType, entityId, status });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to record verification on blockchain:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get transaction history for audit
 */
export const getTransactionHistory = async (filters = {}) => {
  try {
    const result = await evaluateTransaction(
      'GetTransactionHistory',
      JSON.stringify(filters)
    );
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get transaction history:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Verify transaction on blockchain
 */
export const verifyTransaction = async (txId) => {
  try {
    if (!isFabricConnected()) {
      return { 
        verified: false, 
        error: 'Blockchain not connected',
        mock: true 
      };
    }
    
    const result = await evaluateTransaction('ReadWage', txId);
    return { 
      success: true, 
      verified: true,
      data: result, 
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    logger.error('Failed to verify transaction:', error.message);
    return { success: false, verified: false, error: error.message };
  }
};

/**
 * Batch record multiple wage payments (for bulk uploads)
 */
export const batchRecordWages = async (wagesArray) => {
  try {
    if (!isFabricConnected()) {
      logger.warn('Blockchain not connected - batch record in mock mode');
      return { 
        success: true, 
        mock: true, 
        count: wagesArray.length,
        message: 'Recorded in mock mode'
      };
    }

    const wagePayloads = wagesArray.map(wage => ({
      wageId: wage.referenceNumber || `WAGE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workerHash: wage.workerIdHash,
      employerHash: wage.employerIdHash || 'SELF_DECLARED',
      amount: wage.amount.toString(),
      currency: 'INR',
      jobType: wage.description || 'labor',
      timestamp: wage.initiatedAt?.toISOString() || new Date().toISOString(),
      policyVersion: '2025-Q4'
    }));
    
    const result = await submitTransaction(
      'BatchRecordWages',
      JSON.stringify(wagePayloads)
    );
    
    logger.info('Batch wages recorded on blockchain', { count: wagesArray.length });
    return { success: true, count: wagesArray.length, result };
  } catch (error) {
    logger.error('Failed to batch record wages:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Query worker's income history with date range
 */
export const getWorkerIncomeHistory = async (workerIdHash, startDate, endDate) => {
  try {
    if (!isFabricConnected()) {
      return { success: false, error: 'Blockchain not connected' };
    }

    const result = await evaluateTransaction(
      'GetWorkerIncomeHistory',
      workerIdHash,
      startDate || '',
      endDate || ''
    );
    
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get income history:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Check poverty status (BPL/APL) from blockchain
 */
export const checkPovertyStatus = async (workerIdHash, state = 'DEFAULT', startDate, endDate) => {
  try {
    if (!isFabricConnected()) {
      return { success: false, error: 'Blockchain not connected' };
    }

    const result = await evaluateTransaction(
      'CheckPovertyStatus',
      workerIdHash,
      state,
      startDate || '',
      endDate || ''
    );
    
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to check poverty status:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Record UPI transaction on blockchain
 * Chaincode signature: RecordUPITransaction(txID, workerIDHash, amount, currency, senderName, senderPhone, transactionRef, paymentMethod)
 */
export const recordUPITransaction = async (upiData) => {
  try {
    const { 
      txId, 
      workerIdHash, 
      employerIdHash,
      amount, 
      senderName, 
      senderPhone, 
      senderUPI,
      transactionRef,
      paymentMethod 
    } = upiData;
    
    if (!isFabricConnected()) {
      logger.warn('Blockchain not connected - UPI transaction in mock mode');
      return { 
        success: true, 
        mock: true, 
        txId: txId || `UPI-MOCK-${Date.now()}` 
      };
    }

    // Match chaincode signature exactly
    const result = await submitTransaction(
      'RecordUPITransaction',
      txId,                              // txID
      workerIdHash,                      // workerIDHash
      amount.toString(),                 // amount (as string for gRPC)
      'INR',                             // currency
      senderName || 'Unknown Sender',    // senderName
      senderPhone || '',                 // senderPhone
      transactionRef || txId,            // transactionRef
      paymentMethod || 'UPI'             // paymentMethod
    );
    
    logger.info('UPI transaction recorded on blockchain', { 
      txId, 
      workerIdHash, 
      amount,
      senderName,
      employerIdHash: employerIdHash?.substring(0, 8)
    });
    
    return { success: true, txId, result };
  } catch (error) {
    logger.error('Failed to record UPI transaction:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get poverty threshold from blockchain
 */
export const getPovertyThreshold = async (state = 'DEFAULT', category = 'BPL') => {
  try {
    if (!isFabricConnected()) {
      // Return default thresholds if not connected
      return { 
        success: true, 
        data: { 
          state, 
          category, 
          amount: category === 'BPL' ? 120000 : 500000,
          source: 'default'
        } 
      };
    }

    const result = await evaluateTransaction(
      'GetPovertyThreshold',
      state,
      category
    );
    
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to get poverty threshold:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Flag an anomaly on the blockchain
 */
export const flagAnomaly = async (wageId, anomalyScore, reason, flaggedBy) => {
  try {
    if (!isFabricConnected()) {
      return { success: true, mock: true };
    }

    const result = await submitTransaction(
      'FlagAnomaly',
      wageId,
      anomalyScore.toString(),
      reason,
      flaggedBy.toString()
    );
    
    logger.info('Anomaly flagged on blockchain', { wageId, anomalyScore });
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to flag anomaly:', error.message);
    return { success: false, error: error.message };
  }
};

export default {
  initBlockchain,
  getNetworkStatus,
  recordWagePayment,
  registerWorkerOnChain,
  registerUserOnChain,
  updateUserPermissions,
  getUserBlockchainIdentity,
  updateUserStatus,
  getWorkerWageHistory,
  getWorkerFromChain,
  updateWorkerClassification,
  recordVerification,
  getTransactionHistory,
  verifyTransaction,
  batchRecordWages,
  getWorkerIncomeHistory,
  checkPovertyStatus,
  recordUPITransaction,
  getPovertyThreshold,
  flagAnomaly
};
