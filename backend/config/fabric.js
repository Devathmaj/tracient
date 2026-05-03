/**
 * Hyperledger Fabric Gateway Configuration
 * This module provides connection to the Fabric network
 * Falls back to mock implementation if Fabric packages not installed
 */
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import logger from '../utils/logger.util.js';

// Ensure environment variables are loaded
dotenv.config();

// Try to import Fabric packages
let fabricGateway, grpc;
let fabricAvailable = false;

try {
  fabricGateway = await import('@hyperledger/fabric-gateway');
  grpc = await import('@grpc/grpc-js');
  fabricAvailable = true;
  logger.info('Hyperledger Fabric packages loaded successfully');
} catch (err) {
  logger.warn('Hyperledger Fabric packages not installed - using mock implementation');
  fabricAvailable = false;
}

// Fabric configuration from environment
const FABRIC_CONFIG = {
  channelName: process.env.FABRIC_CHANNEL || 'mychannel',
  chaincodeName: process.env.FABRIC_CHAINCODE || 'tracient',
  mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
  cryptoPath: process.env.FABRIC_CRYPTO_PATH || path.resolve('..', 'blockchain', 'network', 'test-network', 'organizations'),
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
  peerHostAlias: process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com',
  userName: process.env.FABRIC_USER_NAME || 'testadmin',
  timeoutShort: parseInt(process.env.FABRIC_TIMEOUT_SHORT) || 5000,
  timeoutMedium: parseInt(process.env.FABRIC_TIMEOUT_MEDIUM) || 15000,
  timeoutLong: parseInt(process.env.FABRIC_TIMEOUT_LONG) || 60000
};

// Log the configuration
logger.info(`Fabric config - User: ${FABRIC_CONFIG.userName}, Channel: ${FABRIC_CONFIG.channelName}, Chaincode: ${FABRIC_CONFIG.chaincodeName}`);

// Export config for use in services
export { FABRIC_CONFIG };

let client = null;
let gateway = null;
let contract = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Check if blockchain is enabled
 */
export const isBlockchainEnabled = () => {
  return process.env.FABRIC_ENABLED === 'true' && !process.env.FABRIC_MOCK_MODE;
};

/**
 * Check network health by attempting to connect
 */
const checkNetworkHealth = async () => {
  try {
    // Simple health check - try to access peer endpoint
    const http = await import('http');
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 7051,
        path: '/healthz',
        method: 'GET',
        timeout: 3000
      }, (res) => {
        resolve({ healthy: res.statusCode === 200 });
      });
      
      req.on('error', () => {
        resolve({ healthy: false, error: 'Peer not reachable' });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ healthy: false, error: 'Connection timeout' });
      });
      
      req.end();
    });
  } catch (error) {
    return { healthy: false, error: error.message };
  }
};

/**
 * Initialize Fabric Gateway connection with retry logic
 */
export const initFabricGateway = async (retries = MAX_CONNECTION_ATTEMPTS) => {
  if (!fabricAvailable) {
    logger.info('Fabric not available - using mock mode');
    return false;
  }

  // Check if mock mode is enabled
  if (process.env.FABRIC_MOCK_MODE === 'true') {
    logger.info('Fabric mock mode enabled - skipping real connection');
    return false;
  }
  
  // Check if Fabric is enabled
  if (process.env.FABRIC_ENABLED !== 'true') {
    logger.warn('Fabric integration is disabled. Set FABRIC_ENABLED=true to enable.');
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Initializing Fabric Gateway connection... (attempt ${attempt}/${retries})`);
      connectionAttempts = attempt;

      // Load credentials
      const credentials = await loadCredentials();
      if (!credentials) {
        logger.warn('Fabric credentials not found. Running in mock mode.');
        return null;
      }

      // Create gRPC client
      client = await createGrpcClient(credentials.tlsCertificate);

      // Create identity - just a plain object with mspId and credentials
      const userIdentity = {
        mspId: FABRIC_CONFIG.mspId,
        credentials: credentials.certificate
      };

      // Create signer from private key
      const userSigner = fabricGateway.signers.newPrivateKeySigner(
        crypto.createPrivateKey(credentials.privateKey)
      );

      // Connect to gateway
      gateway = fabricGateway.connect({
        client,
        identity: userIdentity,
        signer: userSigner,
        hash: fabricGateway.hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + FABRIC_CONFIG.timeoutShort }),
        endorseOptions: () => ({ deadline: Date.now() + FABRIC_CONFIG.timeoutMedium }),
        submitOptions: () => ({ deadline: Date.now() + FABRIC_CONFIG.timeoutShort }),
        commitStatusOptions: () => ({ deadline: Date.now() + FABRIC_CONFIG.timeoutLong })
      });

      // Get network and contract
      const network = gateway.getNetwork(FABRIC_CONFIG.channelName);
      contract = network.getContract(FABRIC_CONFIG.chaincodeName);

      isConnected = true;
      logger.info('Fabric Gateway connected successfully');
      return contract;
    } catch (error) {
      logger.warn(`Connection attempt ${attempt} failed: ${error.message}`);
      isConnected = false;
      
      if (attempt === retries) {
        logger.error(`Failed to connect to Fabric after ${retries} attempts. Running in mock mode.`);
        return null;
      }
      
      // Exponential backoff
      const waitTime = 2000 * attempt;
      logger.info(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  return null;
};

/**
 * Load TLS and identity credentials
 */
const loadCredentials = async () => {
  try {
    const cryptoPath = FABRIC_CONFIG.cryptoPath;
    const orgPath = path.join(cryptoPath, 'peerOrganizations', 'org1.example.com');
    const userName = FABRIC_CONFIG.userName;

    // TLS certificate
    const tlsCertPath = path.join(orgPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
    const tlsCertificate = await fs.readFile(tlsCertPath);

    // Try multiple locations for user certificates
    let certPath, keyDirPath;
    let identitySource = '';
    
    // Get the absolute path to the project root
    const backendDir = process.cwd();
    const projectRoot = path.dirname(backendDir);
    
    // Try 1: Custom enrolled users in blockchain/scripts/users (with role attributes)
    const scriptsUserPath = path.join(projectRoot, 'blockchain', 'scripts', 'users', userName, 'msp');
    const scriptsUserCertPath = path.join(scriptsUserPath, 'signcerts', 'cert.pem');
    
    logger.info(`Checking for identity at: ${scriptsUserCertPath}`);
    
    try {
      await fs.access(scriptsUserCertPath);
      certPath = scriptsUserCertPath;
      keyDirPath = path.join(scriptsUserPath, 'keystore');
      identitySource = 'blockchain/scripts/users (with IAM role attributes)';
      logger.info(`✓ Found Fabric identity: ${userName} at ${scriptsUserPath}`);
    } catch (err) {
      logger.info(`Identity not found at scripts/users, trying standard location...`);
      
      // Try 2: Standard Fabric users directory
      try {
        certPath = path.join(orgPath, 'users', userName, 'msp', 'signcerts', 'cert.pem');
        await fs.access(certPath);
        keyDirPath = path.join(orgPath, 'users', userName, 'msp', 'keystore');
        identitySource = 'test-network/organizations';
        logger.info(`✓ Found Fabric identity: ${userName} at test-network`);
      } catch {
        // Try 3: Fall back to User1 (original identity - no role attributes)
        certPath = path.join(orgPath, 'users', 'User1@org1.example.com', 'msp', 'signcerts', 'cert.pem');
        keyDirPath = path.join(orgPath, 'users', 'User1@org1.example.com', 'msp', 'keystore');
        identitySource = 'User1@org1.example.com (NO IAM role attributes - will fail IAM checks!)';
        logger.warn(`⚠ Custom user '${userName}' not found! Falling back to User1@org1.example.com`);
        logger.warn(`⚠ This identity has NO role attributes - blockchain IAM operations will fail!`);
      }
    }

    logger.info(`Loading identity from: ${identitySource}`);
    logger.info(`Certificate path: ${certPath}`);
    logger.info(`Keystore path: ${keyDirPath}`);

    const certificate = await fs.readFile(certPath);

    // Private key
    const keyFiles = await fs.readdir(keyDirPath);
    const keyPath = path.join(keyDirPath, keyFiles[0]);
    const privateKey = await fs.readFile(keyPath);
    
    logger.info(`✓ Credentials loaded successfully for: ${userName}`);

    return { tlsCertificate, certificate, privateKey };
  } catch (error) {
    logger.error('Could not load Fabric credentials:', error.message);
    return null;
  }
};

/**
 * Create gRPC client connection
 */
const createGrpcClient = async (tlsCertificate) => {
  if (process.env.FABRIC_TLS_INSECURE === 'true') {
    logger.warn('FABRIC_TLS_INSECURE=true - using insecure gRPC connection');
    return new grpc.Client(
      FABRIC_CONFIG.peerEndpoint,
      grpc.credentials.createInsecure(),
      {
        'grpc.ssl_target_name_override': FABRIC_CONFIG.peerHostAlias,
        'grpc.default_authority': FABRIC_CONFIG.peerHostAlias
      }
    );
  }

  const tlsCredentials = grpc.credentials.createSsl(tlsCertificate);
  return new grpc.Client(
    FABRIC_CONFIG.peerEndpoint,
    tlsCredentials,
    {
      'grpc.ssl_target_name_override': FABRIC_CONFIG.peerHostAlias,
      'grpc.default_authority': FABRIC_CONFIG.peerHostAlias
    }
  );
};

/**
 * Get the Fabric contract instance
 */
export const getContract = () => {
  return contract;
};

/**
 * Get connection status
 */
export const getConnectionStatus = () => {
  return {
    connected: isConnected,
    fabricAvailable,
    channel: FABRIC_CONFIG.channelName,
    chaincode: FABRIC_CONFIG.chaincodeName,
    mspId: FABRIC_CONFIG.mspId,
    endpoint: FABRIC_CONFIG.peerEndpoint,
    attempts: connectionAttempts
  };
};

/**
 * Check if connected to Fabric
 */
export const isFabricConnected = () => {
  return isConnected && contract !== null;
};

/**
 * Decode Uint8Array result from Fabric Gateway to string
 */
const decodeResult = (result) => {
  if (!result || result.length === 0) {
    return '';
  }
  // Fabric Gateway returns Uint8Array, need to decode it properly
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(result);
};

/**
 * Submit a transaction to the blockchain
 */
export const submitTransaction = async (functionName, ...args) => {
  try {
    if (!contract) {
      logger.warn('Fabric contract not initialized. Using mock response.');
      return mockTransaction(functionName, args);
    }

    const result = await contract.submitTransaction(functionName, ...args);
    const resultString = decodeResult(result);
    
    // Handle empty result
    if (!resultString || resultString === '') {
      return { success: true, functionName };
    }
    
    try {
      return JSON.parse(resultString);
    } catch {
      return { success: true, result: resultString };
    }
  } catch (error) {
    logger.error(`Transaction ${functionName} failed:`, error.message);
    throw error;
  }
};

/**
 * Evaluate a query on the blockchain
 */
export const evaluateTransaction = async (functionName, ...args) => {
  try {
    if (!contract) {
      logger.warn('Fabric contract not initialized. Using mock response.');
      return mockTransaction(functionName, args);
    }

    const result = await contract.evaluateTransaction(functionName, ...args);
    const resultString = decodeResult(result);
    
    // Handle empty result
    if (!resultString || resultString === '') {
      return { success: true, functionName };
    }
    
    try {
      return JSON.parse(resultString);
    } catch {
      return resultString;
    }
  } catch (error) {
    logger.error(`Query ${functionName} failed:`, error.message);
    throw error;
  }
};

/**
 * Mock transaction for when Fabric is not connected
 */
const mockTransaction = (functionName, args) => {
  logger.info(`Mock transaction: ${functionName}(${args.join(', ')})`);
  return {
    success: true,
    mock: true,
    functionName,
    args,
    timestamp: new Date().toISOString(),
    txId: `mock-${Date.now()}`
  };
};

/**
 * Close Fabric Gateway connection
 */
export const closeFabricGateway = async () => {
  try {
    if (gateway) {
      gateway.close();
      logger.info('Fabric Gateway connection closed');
    }
    if (client) {
      client.close();
      logger.info('gRPC client connection closed');
    }
    isConnected = false;
    contract = null;
  } catch (error) {
    logger.error('Error closing Fabric Gateway:', error.message);
  }
};

/**
 * Reconnect to Fabric Gateway
 */
export const reconnectFabricGateway = async () => {
  logger.info('Attempting to reconnect to Fabric Gateway...');
  await closeFabricGateway();
  return await initFabricGateway();
};

export default {
  initFabricGateway,
  getContract,
  getConnectionStatus,
  isFabricConnected,
  isBlockchainEnabled,
  submitTransaction,
  evaluateTransaction,
  closeFabricGateway,
  reconnectFabricGateway,
  FABRIC_CONFIG
};
