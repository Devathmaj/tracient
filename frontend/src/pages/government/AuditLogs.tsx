import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search,
  Download,
  RefreshCw,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { 
  Card, 
  CardContent,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  Modal,
  Table
} from '@/components/common';
import { formatDate } from '@/utils/formatters';
import api from '@/services/api';

interface AuditLog {
  id: string;
  transactionId: string;
  blockNumber: number;
  timestamp: string;
  eventType: 'wage_recorded' | 'worker_registered' | 'employer_registered' | 'bpl_status_updated' | 'anomaly_flagged' | 'policy_updated' | string;
  performedBy: {
    id: string;
    name: string;
    role: string;
  };
  target: {
    id: string;
    name: string;
    type: string;
  };
  details: Record<string, any>;
  status: 'success' | 'failed' | 'pending';
  ipAddress: string;
  userAgent: string;
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('today');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLogs = async () => {
    try {
      setError(null);
      // Build query params
      const params: Record<string, string> = { limit: '50' };
      if (eventTypeFilter !== 'all') params.action = eventTypeFilter;
      
      const response: any = await api.get('/admin/audit-logs', { params });
      
      if (response.success && response.data) {
        const mappedLogs: AuditLog[] = response.data.map((log: any) => ({
          id: log._id,
          transactionId: log.transactionHash || log._id,
          blockNumber: log.blockNumber || 0,
          timestamp: log.timestamp || log.createdAt,
          eventType: log.action || 'unknown',
          performedBy: {
            id: log.userId?._id || log.userId || 'system',
            name: log.userId?.name || log.userName || 'System',
            role: log.userId?.role || log.userRole || 'system'
          },
          target: {
            id: log.entityId || log.targetId || '',
            name: log.entityName || log.metadata?.targetName || 'N/A',
            type: log.entityType || log.targetType || 'unknown'
          },
          details: log.metadata || log.details || {},
          status: log.status || 'success',
          ipAddress: log.ipAddress || 'N/A',
          userAgent: log.userAgent || 'N/A'
        }));
        setLogs(mappedLogs);
      } else {
        setLogs([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLogs();
    setIsRefreshing(false);
  };

  const eventTypeOptions = [
    { value: 'all', label: 'All Events' },
    { value: 'wage_recorded', label: 'Wage Recorded' },
    { value: 'worker_registered', label: 'Worker Registered' },
    { value: 'employer_registered', label: 'Employer Registered' },
    { value: 'bpl_status_updated', label: 'BPL Status Updated' },
    { value: 'anomaly_flagged', label: 'Anomaly Flagged' },
    { value: 'policy_updated', label: 'Policy Updated' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' },
  ];

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
  ];

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      wage_recorded: 'Wage Recorded',
      worker_registered: 'Worker Registered',
      employer_registered: 'Employer Registered',
      bpl_status_updated: 'BPL Status Updated',
      anomaly_flagged: 'Anomaly Flagged',
      policy_updated: 'Policy Updated',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getEventTypeBadge = (type: string) => {
    const config: Record<string, { variant: 'success' | 'primary' | 'warning' | 'error' | 'default'; icon: any }> = {
      wage_recorded: { variant: 'success', icon: IndianRupee },
      worker_registered: { variant: 'primary', icon: User },
      employer_registered: { variant: 'primary', icon: Building2 },
      bpl_status_updated: { variant: 'warning', icon: CheckCircle2 },
      anomaly_flagged: { variant: 'error', icon: XCircle },
      policy_updated: { variant: 'default', icon: FileText },
    };
    return config[type] || { variant: 'default' as const, icon: FileText };
  };

  const getStatusBadge = (status: AuditLog['status']) => {
    const config = {
      success: { variant: 'success' as const, label: 'Success' },
      failed: { variant: 'error' as const, label: 'Failed' },
      pending: { variant: 'warning' as const, label: 'Pending' },
    };
    return config[status];
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.transactionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performedBy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEventType = eventTypeFilter === 'all' || log.eventType === eventTypeFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesEventType && matchesStatus;
  });

  const columns = [
    {
      key: 'eventType',
      header: 'Event',
      render: (log: AuditLog) => {
        const badge = getEventTypeBadge(log.eventType);
        const Icon = badge.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{getEventTypeLabel(log.eventType)}</span>
          </div>
        );
      },
    },
    {
      key: 'performedBy',
      header: 'Performed By',
      render: (log: AuditLog) => (
        <div>
          <p className="font-medium text-gray-900">{log.performedBy.name}</p>
          <p className="text-xs text-gray-500">{log.performedBy.role}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (log: AuditLog) => (
        <div>
          <p className="font-medium text-gray-900">{log.target.name}</p>
          <p className="text-xs text-gray-500">{log.target.type}</p>
        </div>
      ),
    },
    {
      key: 'blockNumber',
      header: 'Block #',
      render: (log: AuditLog) => (
        <span className="font-mono text-sm">{log.blockNumber.toLocaleString()}</span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (log: AuditLog) => (
        <span className="text-sm text-gray-500">{formatDate(log.timestamp)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (log: AuditLog) => {
        const status = getStatusBadge(log.status);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (log: AuditLog) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="text-lg text-gray-600">{error}</p>
        <Button onClick={handleRefresh}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 mt-1">Blockchain transaction history and system events</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
            <p className="text-sm text-gray-500">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {logs.filter(l => l.status === 'success').length}
            </p>
            <p className="text-sm text-gray-500">Successful</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {logs.filter(l => l.status === 'failed').length}
            </p>
            <p className="text-sm text-gray-500">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {logs[0]?.blockNumber.toLocaleString() || 0}
            </p>
            <p className="text-sm text-gray-500">Latest Block</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by transaction ID, performer, or target..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={eventTypeOptions}
              value={eventTypeFilter}
              onChange={setEventTypeFilter}
              className="w-48"
            />
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-36"
            />
            <Select
              options={dateRangeOptions}
              value={dateRange}
              onChange={setDateRange}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={filteredLogs}
            keyField="id"
            emptyMessage="No audit logs found matching your criteria"
          />
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Details"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Badge variant={getEventTypeBadge(selectedLog.eventType).variant}>
                {getEventTypeLabel(selectedLog.eventType)}
              </Badge>
              <Badge variant={getStatusBadge(selectedLog.status).variant}>
                {getStatusBadge(selectedLog.status).label}
              </Badge>
            </div>

            {/* Transaction Info */}
            <div className="p-4 bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
              <p className="text-sm font-mono text-green-400 break-all">
                {selectedLog.transactionId}
              </p>
            </div>

            {/* Details Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Performed By</p>
                  <p className="font-medium text-gray-900">{selectedLog.performedBy.name}</p>
                  <p className="text-sm text-gray-500">{selectedLog.performedBy.role}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Target</p>
                  <p className="font-medium text-gray-900">{selectedLog.target.name}</p>
                  <p className="text-sm text-gray-500">{selectedLog.target.type}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Block Number</p>
                  <p className="font-medium text-gray-900">{selectedLog.blockNumber.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Timestamp</p>
                  <p className="font-medium text-gray-900">{formatDate(selectedLog.timestamp)}</p>
                </div>
              </div>
            </div>

            {/* Event Details */}
            <div>
              <p className="text-sm text-gray-500 mb-2">Event Details</p>
              <div className="p-4 bg-gray-50 rounded-lg">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            {/* Technical Info */}
            <div className="pt-4 border-t space-y-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>IP Address</span>
                <span className="font-mono">{selectedLog.ipAddress}</span>
              </div>
              <div className="flex justify-between">
                <span>User Agent</span>
                <span className="font-mono truncate max-w-xs">{selectedLog.userAgent}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AuditLogs;
