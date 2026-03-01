/**
 * Blockchain Testing Page
 * Comprehensive interface for testing and managing blockchain operations
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Terminal,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  Clock,
  Activity,
  FileText,
  Server,
  Link,
  Zap,
  Shield,
  List,
  IndianRupee,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Spinner, Badge, Alert, Tabs } from '../../components/common';
import { get, post } from '../../services/api';

// Types
interface ChaincodeFunctionParam {
  name: string;
  type: string;
  required: boolean;
  example: string | number;
}

interface ChaincodeFunction {
  name: string;
  description: string;
  params: ChaincodeFunctionParam[];
  dangerous?: boolean;
}

interface ChaincodeFunctions {
  read: ChaincodeFunction[];
  write: ChaincodeFunction[];
}

interface ConnectionStatus {
  connected: boolean;
  fabricAvailable: boolean;
  channel: string;
  chaincode: string;
  mspId: string;
  endpoint: string;
  attempts: number;
}

interface TestResult {
  name: string;
  status: string;
  executionTime?: number;
  result?: any;
  error?: string;
  details?: any;
}

interface ExecutionResult {
  functionName: string;
  type: string;
  params: string[];
  success: boolean;
  result: any;
  error: string | null;
  executionTime: number;
  timestamp: string;
}

interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  raw?: string;
}

interface BlockchainTransaction {
  id: string;
  type: 'QR' | 'UPI';
  txId: string;
  amount: number;
  currency: string;
  senderName: string;
  senderPhone: string;
  senderAccount: string;
  recipientName: string;
  recipientIdHash: string;
  recipientAccount: string;
  paymentMethod: string;
  status: string;
  blockchainTxId: string;
  verifiedOnChain: boolean;
  transactionRef: string;
  remarks: string;
  createdAt: string;
  completedAt: string;
}

interface TransactionSummary {
  totalOnChain: number;
  totalTransactions: number;
  totalPending: number;
  totalAmountOnChain: number;
  syncRate: string;
}

interface TransactionsData {
  transactions: BlockchainTransaction[];
  summary: TransactionSummary;
  pagination: { page: number; limit: number; total: number };
}

const BlockchainTesting: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState('connection');
  const [loading, setLoading] = useState(true);
  const [functions, setFunctions] = useState<ChaincodeFunctions | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<ChaincodeFunction | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  const [transactionsData, setTransactionsData] = useState<TransactionsData | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Fetch functions and config
  const fetchFunctions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await get<any>('/blockchain/test/functions');
      setFunctions(response.data.functions);
      setConfig(response.data.config);
      setConnection(response.data.connection);
    } catch (error) {
      console.error('Failed to fetch functions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run connection tests
  const runConnectionTests = async () => {
    try {
      setTestingConnection(true);
      const response = await get<any>('/blockchain/test/connection');
      setTestResults(response.data.tests);
    } catch (error) {
      console.error('Failed to run connection tests:', error);
    } finally {
      setTestingConnection(false);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const response = await get<any>('/blockchain/test/logs?limit=100');
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  // Fetch blockchain transactions
  const fetchTransactions = useCallback(async (page = 1) => {
    try {
      setLoadingTransactions(true);
      const response = await get<any>(`/blockchain/test/transactions?page=${page}&limit=25`);
      setTransactionsData(response.data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // Execute function
  const executeFunction = async (fn: ChaincodeFunction, type: 'read' | 'write') => {
    if (executing) return;
    
    try {
      setExecuting(true);
      const params = fn.params.map(p => paramValues[p.name] || '');
      
      const response = await post<any>('/blockchain/test/execute', {
        functionName: fn.name,
        params,
        type
      });
      
      const result: ExecutionResult = response.data;
      setExecutionHistory(prev => [result, ...prev].slice(0, 50));
      
      // Clear params after successful execution
      if (result.success) {
        setParamValues({});
      }
    } catch (error: any) {
      const errorResult: ExecutionResult = {
        functionName: fn.name,
        type,
        params: fn.params.map(p => paramValues[p.name] || ''),
        success: false,
        result: null,
        error: error.message || 'Execution failed',
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
      setExecutionHistory(prev => [errorResult, ...prev].slice(0, 50));
    } finally {
      setExecuting(false);
    }
  };

  // Initialize ledger
  const initLedger = async () => {
    if (!window.confirm('Are you sure you want to initialize the ledger? This will add sample data.')) {
      return;
    }
    
    try {
      setExecuting(true);
      await post<any>('/blockchain/test/init-ledger', {});
      alert('Ledger initialized successfully!');
      runConnectionTests();
    } catch (error: any) {
      alert(`Failed to initialize ledger: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // Toggle function expansion
  const toggleFunction = (fnName: string) => {
    setExpandedFunctions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fnName)) {
        newSet.delete(fnName);
      } else {
        newSet.add(fnName);
      }
      return newSet;
    });
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Initial load
  useEffect(() => {
    fetchFunctions();
    runConnectionTests();
    fetchLogs();
    
    // Refresh logs every 30 seconds
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [fetchFunctions]);

  // Auto-load transactions when Transactions tab is selected
  useEffect(() => {
    if (activeTab === 'transactions' && !transactionsData && !loadingTransactions) {
      fetchTransactions(1);
    }
  }, [activeTab, transactionsData, loadingTransactions, fetchTransactions]);

  // Tabs
  const tabs = [
    { id: 'connection', label: 'Connection', icon: Link },
    { id: 'functions', label: 'Functions', icon: Zap },
    { id: 'execution', label: 'Execution History', icon: Clock },
    { id: 'logs', label: 'Logs', icon: Terminal },
    { id: 'transactions', label: 'Transactions', icon: List },
    { id: 'identity', label: 'Identity', icon: Shield }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <Database className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Blockchain Testing</h1>
            <p className="text-gray-500">Test and manage Hyperledger Fabric operations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={connection?.connected ? 'success' : 'error'}>
            {connection?.connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button variant="outline" onClick={fetchFunctions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${connection?.connected ? 'bg-green-100' : 'bg-red-100'}`}>
                {connection?.connected ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Connection</p>
                <p className="font-semibold">{connection?.connected ? 'Active' : 'Inactive'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Server className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Channel</p>
                <p className="font-semibold font-mono">{config?.channel || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Chaincode</p>
                <p className="font-semibold font-mono">{config?.chaincode || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Activity className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Functions</p>
                <p className="font-semibold">
                  {functions ? functions.read.length + functions.write.length : 0} Available
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs.map(t => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content */}
      <div className="mt-4">
        {/* Connection Tab */}
        {activeTab === 'connection' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Connection Tests</CardTitle>
                  <Button onClick={runConnectionTests} disabled={testingConnection}>
                    {testingConnection ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Run Tests
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {testResults.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Click "Run Tests" to check blockchain connection
                  </p>
                ) : (
                  <div className="space-y-3">
                    {testResults.map((test, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-lg border ${
                          test.status.includes('passed')
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {test.status.includes('passed') ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            <span className="font-medium">{test.name}</span>
                          </div>
                          {test.executionTime && (
                            <span className="text-sm text-gray-500">{test.executionTime}ms</span>
                          )}
                        </div>
                        {test.error && (
                          <p className="mt-2 text-sm text-red-600 pl-8">{test.error}</p>
                        )}
                        {test.result && (
                          <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-32 ml-8">
                            {JSON.stringify(test.result, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button variant="danger" onClick={initLedger} disabled={executing}>
                    <Database className="w-4 h-4 mr-2" />
                    Initialize Ledger
                  </Button>
                  <Button variant="outline" onClick={() => fetchFunctions()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Connection
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  ⚠️ Initialize Ledger will seed sample data. Only use for testing.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Functions Tab */}
        {activeTab === 'functions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Read Functions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">READ</span>
                  Query Functions ({functions?.read.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto">
                <div className="space-y-2">
                  {functions?.read.map((fn) => (
                    <div key={fn.name} className="border rounded-lg">
                      <button
                        onClick={() => {
                          toggleFunction(fn.name);
                          setSelectedFunction(fn);
                          setParamValues({});
                        }}
                        className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2">
                          {expandedFunctions.has(fn.name) ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="font-mono text-sm">{fn.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {fn.params.length} param{fn.params.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      
                      {expandedFunctions.has(fn.name) && (
                        <div className="p-3 border-t bg-gray-50">
                          <p className="text-sm text-gray-600 mb-3">{fn.description}</p>
                          
                          {fn.params.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {fn.params.map((param) => (
                                <div key={param.name}>
                                  <label className="text-xs font-medium text-gray-700">
                                    {param.name}
                                    {param.required && <span className="text-red-500">*</span>}
                                  </label>
                                  <input
                                    type={param.type === 'number' ? 'number' : 'text'}
                                    placeholder={String(param.example)}
                                    value={paramValues[param.name] || ''}
                                    onChange={(e) => setParamValues(prev => ({
                                      ...prev,
                                      [param.name]: e.target.value
                                    }))}
                                    className="w-full px-2 py-1 text-sm border rounded mt-1"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <Button
                            size="sm"
                            onClick={() => executeFunction(fn, 'read')}
                            disabled={executing}
                          >
                            {executing && selectedFunction?.name === fn.name ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : (
                              <Play className="w-3 h-3 mr-2" />
                            )}
                            Execute
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Write Functions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">WRITE</span>
                  Submit Functions ({functions?.write.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto">
                <Alert variant="warning" className="mb-4">
                  Write operations modify the blockchain ledger. Use with caution!
                </Alert>
                <div className="space-y-2">
                  {functions?.write.map((fn) => (
                    <div key={fn.name} className={`border rounded-lg ${fn.dangerous ? 'border-red-200' : ''}`}>
                      <button
                        onClick={() => {
                          toggleFunction(fn.name);
                          setSelectedFunction(fn);
                          setParamValues({});
                        }}
                        className={`w-full p-3 flex items-center justify-between hover:bg-gray-50 ${
                          fn.dangerous ? 'bg-red-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {expandedFunctions.has(fn.name) ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="font-mono text-sm">{fn.name}</span>
                          {fn.dangerous && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {fn.params.length} param{fn.params.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      
                      {expandedFunctions.has(fn.name) && (
                        <div className="p-3 border-t bg-gray-50">
                          <p className="text-sm text-gray-600 mb-3">{fn.description}</p>
                          
                          {fn.params.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {fn.params.map((param) => (
                                <div key={param.name}>
                                  <label className="text-xs font-medium text-gray-700">
                                    {param.name}
                                    {param.required && <span className="text-red-500">*</span>}
                                  </label>
                                  <input
                                    type={param.type === 'number' ? 'number' : 'text'}
                                    placeholder={String(param.example)}
                                    value={paramValues[param.name] || ''}
                                    onChange={(e) => setParamValues(prev => ({
                                      ...prev,
                                      [param.name]: e.target.value
                                    }))}
                                    className="w-full px-2 py-1 text-sm border rounded mt-1"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <Button
                            size="sm"
                            variant={fn.dangerous ? 'danger' : 'primary'}
                            onClick={() => executeFunction(fn, 'write')}
                            disabled={executing}
                          >
                            {executing && selectedFunction?.name === fn.name ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : (
                              <Play className="w-3 h-3 mr-2" />
                            )}
                            Execute
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Execution History Tab */}
        {activeTab === 'execution' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Execution History</CardTitle>
                {executionHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExecutionHistory([])}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {executionHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No executions yet. Go to Functions tab to execute chaincode functions.
                </p>
              ) : (
                <div className="space-y-3">
                  {executionHistory.map((exec, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        exec.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {exec.success ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                          <span className="font-mono font-medium">{exec.functionName}</span>
                          <Badge variant={exec.type === 'read' ? 'primary' : 'warning'}>
                            {exec.type.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{exec.executionTime}ms</span>
                          <span>{new Date(exec.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      
                      {exec.params.length > 0 && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-500">Parameters: </span>
                          <span className="text-xs font-mono">
                            [{exec.params.filter(p => p).join(', ')}]
                          </span>
                        </div>
                      )}
                      
                      {exec.success && exec.result && (
                        <div className="relative">
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(exec.result, null, 2))}
                            className="absolute top-2 right-2 p-1 hover:bg-white rounded"
                            title="Copy to clipboard"
                          >
                            <Copy className="w-4 h-4 text-gray-400" />
                          </button>
                          <pre className="text-xs bg-white p-3 rounded overflow-auto max-h-48">
                            {JSON.stringify(exec.result, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {!exec.success && exec.error && (
                        <p className="text-sm text-red-600">{exec.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Blockchain Logs</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm max-h-[500px] overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-400">No logs available</p>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="py-1 border-b border-gray-800">
                      {log.raw ? (
                        <span className="text-gray-300">{log.raw}</span>
                      ) : (
                        <div className="flex gap-2">
                          <span className="text-gray-500">{log.timestamp}</span>
                          <span className={`${
                            log.level === 'error' ? 'text-red-400' :
                            log.level === 'warn' ? 'text-yellow-400' :
                            log.level === 'info' ? 'text-blue-400' :
                            'text-gray-400'
                          }`}>
                            [{log.level?.toUpperCase()}]
                          </span>
                          <span className="text-gray-300">{log.message}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            {/* Transaction Summary Cards */}
            {transactionsData?.summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">On Chain</p>
                        <p className="text-xl font-bold text-green-700">{transactionsData.summary.totalOnChain}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <IndianRupee className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="text-xl font-bold text-blue-700">
                          ₹{transactionsData.summary.totalAmountOnChain.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <Clock className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Pending Sync</p>
                        <p className="text-xl font-bold text-yellow-700">{transactionsData.summary.totalPending}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <Activity className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Sync Rate</p>
                        <p className="text-xl font-bold text-indigo-700">{transactionsData.summary.syncRate}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters & Refresh */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Blockchain Transactions</CardTitle>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => fetchTransactions(txPage)} disabled={loadingTransactions}>
                      {loadingTransactions ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingTransactions && !transactionsData ? (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="lg" />
                  </div>
                ) : !transactionsData || transactionsData.transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No blockchain transactions found</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchTransactions(1)}>
                      Load Transactions
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-3 font-medium text-gray-600">Type</th>
                            <th className="text-left p-3 font-medium text-gray-600">TX ID</th>
                            <th className="text-left p-3 font-medium text-gray-600">Sender</th>
                            <th className="text-left p-3 font-medium text-gray-600">Recipient</th>
                            <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                            <th className="text-center p-3 font-medium text-gray-600">Status</th>
                            <th className="text-center p-3 font-medium text-gray-600">On Chain</th>
                            <th className="text-left p-3 font-medium text-gray-600">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {transactionsData.transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="p-3">
                                <Badge variant={tx.type === 'QR' ? 'warning' : 'primary'}>
                                  {tx.type}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-xs truncate max-w-[120px]" title={tx.blockchainTxId || tx.txId}>
                                    {(tx.blockchainTxId || tx.txId || '').slice(0, 16)}...
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(tx.blockchainTxId || tx.txId)}
                                    className="p-1 hover:bg-gray-200 rounded"
                                    title="Copy full TX ID"
                                  >
                                    <Copy className="w-3 h-3 text-gray-400" />
                                  </button>
                                </div>
                              </td>
                              <td className="p-3">
                                <p className="font-medium text-gray-700">{tx.senderName}</p>
                                {tx.senderPhone && (
                                  <p className="text-xs text-gray-400">{tx.senderPhone}</p>
                                )}
                              </td>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium">{tx.recipientName}</p>
                                  <p className="text-xs text-gray-400 font-mono truncate max-w-[100px]" title={tx.recipientIdHash}>
                                    {tx.recipientIdHash?.slice(0, 10)}...
                                  </p>
                                </div>
                              </td>
                              <td className="p-3 text-right font-semibold">
                                ₹{tx.amount?.toLocaleString('en-IN')}
                              </td>
                              <td className="p-3 text-center">
                                <Badge
                                  variant={
                                    tx.status === 'completed' || tx.status === 'SUCCESS'
                                      ? 'success'
                                      : tx.status === 'pending'
                                      ? 'warning'
                                      : 'error'
                                  }
                                >
                                  {tx.status}
                                </Badge>
                              </td>
                              <td className="p-3 text-center">
                                {tx.verifiedOnChain ? (
                                  <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
                                )}
                              </td>
                              <td className="p-3 text-xs text-gray-500">
                                {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                                <br />
                                {new Date(tx.createdAt).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {transactionsData.pagination.total > transactionsData.pagination.limit && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">
                          Showing {((txPage - 1) * 25) + 1}-{Math.min(txPage * 25, transactionsData.pagination.total)} of {transactionsData.pagination.total}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={txPage <= 1}
                            onClick={() => {
                              const newPage = txPage - 1;
                              setTxPage(newPage);
                              fetchTransactions(newPage);
                            }}
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-gray-600">Page {txPage}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={txPage * 25 >= transactionsData.pagination.total}
                            onClick={() => {
                              const newPage = txPage + 1;
                              setTxPage(newPage);
                              fetchTransactions(newPage);
                            }}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Identity Tab */}
        {activeTab === 'identity' && (
          <Card>
            <CardHeader>
              <CardTitle>Blockchain Identity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">MSP ID</p>
                  <p className="font-mono font-semibold">{config?.mspId || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Peer Endpoint</p>
                  <p className="font-mono font-semibold">{config?.peerEndpoint || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Channel Name</p>
                  <p className="font-mono font-semibold">{config?.channel || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Chaincode Name</p>
                  <p className="font-mono font-semibold">{config?.chaincode || 'N/A'}</p>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Connection Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Fabric Available:</span>
                    <span className={`ml-2 ${connection?.fabricAvailable ? 'text-green-600' : 'text-red-600'}`}>
                      {connection?.fabricAvailable ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Connected:</span>
                    <span className={`ml-2 ${connection?.connected ? 'text-green-600' : 'text-red-600'}`}>
                      {connection?.connected ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Connection Attempts:</span>
                    <span className="ml-2">{connection?.attempts || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default BlockchainTesting;
