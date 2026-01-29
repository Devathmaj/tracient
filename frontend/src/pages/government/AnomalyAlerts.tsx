import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Shield, 
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  RefreshCw,
  ChevronRight,
  User,
  Building2,
  IndianRupee,
  Scan,
  Loader2
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
  Tabs,
  StatCard
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { API_BASE_URL } from '@/utils/constants';

interface Anomaly {
  id: string;
  type: 'duplicate_payment' | 'unusual_amount' | 'frequency_anomaly' | 'income_spike' | 'identity_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  workerId: string;
  workerName: string;
  employerId: string;
  employerName: string;
  amount: number;
  detectedAt: string;
  description: string;
  confidence: number;
  details: {
    pattern: string;
    expectedRange?: string;
    actualValue?: string;
    previousValue?: string;
    frequency?: number;
  };
}

const AnomalyAlerts: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    totalScanned: number;
    anomaliesFound: number;
    newAlertsCreated: number;
  } | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);

  useEffect(() => {
    // Only fetch existing anomalies on mount, don't auto-scan
    fetchAnomalies();
  }, []);

  const fetchAnomalies = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/government/anomalies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // Map backend data to frontend format
        const mappedAnomalies = data.data.map((alert: any) => ({
          id: alert._id,
          type: mapAlertTypeToAnomalyType(alert.alertType),
          severity: alert.severity,
          status: alert.status,
          workerId: alert.entityId || alert.workerId,
          workerName: alert.workerId?.name || alert.metadata?.workerName || 'Unknown Worker',
          employerId: alert.metadata?.employerId || 'N/A',
          employerName: alert.metadata?.employerName || 'Unknown Source',
          amount: alert.evidence?.actualValue || alert.metadata?.amount || 0,
          detectedAt: alert.detectedAt || alert.createdAt,
          description: alert.description || alert.title,
          confidence: alert.confidence || 0,
          details: {
            pattern: alert.metadata?.pattern || alert.description || 'Pattern analysis in progress',
            expectedRange: alert.evidence?.expectedValue ? `₹${alert.evidence.expectedValue}` : undefined,
            actualValue: alert.evidence?.actualValue ? `₹${alert.evidence.actualValue}` : undefined,
            previousValue: alert.metadata?.previousValue,
            frequency: alert.metadata?.frequency
          }
        }));
        setAnomalies(mappedAnomalies);
      } else {
        console.warn('No anomalies found or response format unexpected, using empty list');
        setAnomalies([]);
      }
    } catch (error) {
      console.error('Error fetching anomalies:', error);
      // On error, show empty list instead of mock data
      setAnomalies([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAnomalies();
    setIsRefreshing(false);
  };

  // Helper function to map backend alert types to frontend anomaly types
  const mapAlertTypeToAnomalyType = (alertType: string): Anomaly['type'] => {
    const mapping: Record<string, Anomaly['type']> = {
      'duplicate_payment': 'duplicate_payment',
      'unusual_amount': 'unusual_amount',
      'unusual_pattern': 'frequency_anomaly',
      'frequency_anomaly': 'frequency_anomaly',
      'income_spike': 'income_spike',
      'sudden_increase': 'income_spike',
      'identity_mismatch': 'identity_mismatch',
      'verification_failure': 'identity_mismatch'
    };
    return mapping[alertType] || 'unusual_amount';
  };

  const handleRunAnomalyScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/government/run-anomaly-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          limit: 100  // Scan up to 100 workers
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Handle response - data might be in data.data or directly in data
        const result = data.data || data;
        setScanResult({
          totalScanned: result.totalScanned || 0,
          anomaliesFound: result.anomaliesFound || 0,
          newAlertsCreated: result.newAlertsCreated || 0
        });
        
        setHasScannedOnce(true);
        
        // Refresh the anomaly list to show new alerts
        await fetchAnomalies();
      } else {
        console.error('Scan failed:', data.message);
        setScanResult({
          totalScanned: 0,
          anomaliesFound: 0,
          newAlertsCreated: 0
        });
      }
    } catch (error) {
      console.error('Error running anomaly scan:', error);
      setScanResult({
        totalScanned: 0,
        anomaliesFound: 0,
        newAlertsCreated: 0
      });
    } finally {
      setIsScanning(false);
      setShowScanModal(true);
    }
  };

  const handleUpdateStatus = async (anomalyId: string, newStatus: Anomaly['status'], notes?: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/government/anomalies/${anomalyId}/resolve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          resolution: notes || `Status changed to ${newStatus}`
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setAnomalies(prev =>
          prev.map(a => (a.id === anomalyId ? { ...a, status: newStatus } : a))
        );
      }
    } catch (error) {
      console.error('Error updating anomaly status:', error);
    }
    setSelectedAnomaly(null);
  };

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'dismissed', label: 'Dismissed' },
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'duplicate_payment', label: 'Duplicate Payment' },
    { value: 'unusual_amount', label: 'Unusual Amount' },
    { value: 'frequency_anomaly', label: 'Frequency Anomaly' },
    { value: 'income_spike', label: 'Income Spike' },
    { value: 'identity_mismatch', label: 'Identity Mismatch' },
  ];

  const tabs = [
    { id: 'all', label: 'All Alerts' },
    { id: 'pending', label: 'Pending' },
    { id: 'investigating', label: 'Investigating' },
    { id: 'resolved', label: 'Resolved' },
  ];

  const getSeverityBadge = (severity: Anomaly['severity']) => {
    const config = {
      critical: { variant: 'error' as const, label: 'Critical' },
      high: { variant: 'warning' as const, label: 'High' },
      medium: { variant: 'primary' as const, label: 'Medium' },
      low: { variant: 'default' as const, label: 'Low' },
    };
    return config[severity];
  };

  const getStatusBadge = (status: Anomaly['status']) => {
    const config = {
      pending: { variant: 'warning' as const, label: 'Pending', icon: Clock },
      investigating: { variant: 'primary' as const, label: 'Investigating', icon: Eye },
      resolved: { variant: 'success' as const, label: 'Resolved', icon: CheckCircle2 },
      dismissed: { variant: 'default' as const, label: 'Dismissed', icon: XCircle },
    };
    return config[status];
  };

  const getTypeLabel = (type: Anomaly['type']) => {
    const labels = {
      duplicate_payment: 'Duplicate Payment',
      unusual_amount: 'Unusual Amount',
      frequency_anomaly: 'Frequency Anomaly',
      income_spike: 'Income Spike',
      identity_mismatch: 'Identity Mismatch',
    };
    return labels[type];
  };

  const filteredAnomalies = anomalies.filter(anomaly => {
    const matchesSearch = 
      anomaly.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      anomaly.employerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      anomaly.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || anomaly.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || anomaly.status === statusFilter;
    const matchesType = typeFilter === 'all' || anomaly.type === typeFilter;
    const matchesTab = activeTab === 'all' || anomaly.status === activeTab;
    return matchesSearch && matchesSeverity && matchesStatus && matchesType && matchesTab;
  });

  const stats = {
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    pending: anomalies.filter(a => a.status === 'pending').length,
    resolved: anomalies.filter(a => a.status === 'resolved').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anomaly Alerts</h1>
          <p className="text-gray-500 mt-1">AI-detected anomalies in wage transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="primary" 
            onClick={handleRunAnomalyScan} 
            disabled={isScanning}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Scan className="h-4 w-4 mr-2" />
                Run AI Scan
              </>
            )}
          </Button>
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

      {/* Scan Result Modal */}
      <Modal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        title="Anomaly Scan Complete"
      >
        <div className="p-4 space-y-4">
          {scanResult && (
            <>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">{scanResult.totalScanned}</p>
                  <p className="text-sm text-blue-600">Workers Scanned</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-700">{scanResult.anomaliesFound}</p>
                  <p className="text-sm text-amber-600">Anomalies Found</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-700">{scanResult.newAlertsCreated}</p>
                  <p className="text-sm text-red-600">New Alerts Created</p>
                </div>
              </div>
              
              {scanResult.newAlertsCreated > 0 ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>New anomaly alerts have been created and added to the list.</span>
                </div>
              ) : scanResult.anomaliesFound > 0 ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
                  <Eye className="h-5 w-5" />
                  <span>Anomalies detected but alerts already exist for these workers.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-gray-700">
                  <Shield className="h-5 w-5" />
                  <span>No suspicious patterns detected. All workers appear normal.</span>
                </div>
              )}
            </>
          )}
          
          <div className="flex justify-end">
            <Button onClick={() => setShowScanModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Alerts"
          value={stats.total.toString()}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Critical Alerts"
          value={stats.critical.toString()}
          icon={<Shield className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Review"
          value={stats.pending.toString()}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Resolved"
          value={stats.resolved.toString()}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by worker, employer, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={severityOptions}
              value={severityFilter}
              onChange={setSeverityFilter}
              className="w-40"
            />
            <Select
              options={typeOptions}
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-48"
            />
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Anomaly List */}
      <div className="space-y-4">
        {filteredAnomalies.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              {anomalies.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No Anomalies Detected Yet</h3>
                  <p className="text-gray-500 mb-6">
                    Click the "Run AI Scan" button to analyze worker transactions and detect any anomalies using our AI model.
                  </p>
                  <Button 
                    variant="primary" 
                    onClick={handleRunAnomalyScan} 
                    disabled={isScanning}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Scan className="h-4 w-4 mr-2" />
                        Run AI Scan Now
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <p className="text-gray-500">No anomalies found matching your criteria</p>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredAnomalies.map((anomaly) => {
            const severity = getSeverityBadge(anomaly.severity);
            const status = getStatusBadge(anomaly.status);
            const StatusIcon = status.icon;

            return (
              <Card 
                key={anomaly.id}
                className={`border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                  anomaly.severity === 'critical' ? 'border-l-red-500' :
                  anomaly.severity === 'high' ? 'border-l-amber-500' :
                  anomaly.severity === 'medium' ? 'border-l-blue-500' :
                  'border-l-gray-300'
                }`}
                onClick={() => setSelectedAnomaly(anomaly)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={severity.variant}>{severity.label}</Badge>
                        <Badge variant={status.variant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        <span className="text-sm text-gray-500">{anomaly.id}</span>
                      </div>
                      
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {getTypeLabel(anomaly.type)}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3">{anomaly.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-gray-500">
                          <User className="h-4 w-4" />
                          <span>{anomaly.workerName}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Building2 className="h-4 w-4" />
                          <span>{anomaly.employerName}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <IndianRupee className="h-4 w-4" />
                          <span>{formatCurrency(anomaly.amount)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Clock className="h-4 w-4" />
                          <span>{formatDate(anomaly.detectedAt)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Confidence</p>
                        <p className="font-semibold text-gray-900">{anomaly.confidence}%</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Anomaly Detail Modal */}
      <Modal
        isOpen={!!selectedAnomaly}
        onClose={() => setSelectedAnomaly(null)}
        title="Anomaly Details"
        size="lg"
      >
        {selectedAnomaly && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-center gap-3">
              <Badge variant={getSeverityBadge(selectedAnomaly.severity).variant}>
                {getSeverityBadge(selectedAnomaly.severity).label}
              </Badge>
              <Badge variant={getStatusBadge(selectedAnomaly.status).variant}>
                {getStatusBadge(selectedAnomaly.status).label}
              </Badge>
              <span className="text-sm text-gray-500">{selectedAnomaly.id}</span>
            </div>

            {/* Type and Description */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {getTypeLabel(selectedAnomaly.type)}
              </h3>
              <p className="text-gray-600">{selectedAnomaly.description}</p>
            </div>

            {/* Involved Parties */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Worker</h4>
                <p className="font-medium text-gray-900">{selectedAnomaly.workerName}</p>
                <p className="text-sm text-gray-500">ID: {selectedAnomaly.workerId}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Employer</h4>
                <p className="font-medium text-gray-900">{selectedAnomaly.employerName}</p>
                <p className="text-sm text-gray-500">ID: {selectedAnomaly.employerId}</p>
              </div>
            </div>

            {/* Detection Details */}
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="font-medium text-amber-900 mb-3">Detection Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-amber-700">Pattern</span>
                  <span className="font-medium text-amber-900">{selectedAnomaly.details.pattern}</span>
                </div>
                {selectedAnomaly.details.expectedRange && (
                  <div className="flex justify-between">
                    <span className="text-amber-700">Expected Range</span>
                    <span className="font-medium text-amber-900">{selectedAnomaly.details.expectedRange}</span>
                  </div>
                )}
                {selectedAnomaly.details.actualValue && (
                  <div className="flex justify-between">
                    <span className="text-amber-700">Actual Value</span>
                    <span className="font-medium text-amber-900">{selectedAnomaly.details.actualValue}</span>
                  </div>
                )}
                {selectedAnomaly.details.previousValue && (
                  <div className="flex justify-between">
                    <span className="text-amber-700">Previous Value</span>
                    <span className="font-medium text-amber-900">{selectedAnomaly.details.previousValue}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-amber-700">Confidence Score</span>
                  <span className="font-medium text-amber-900">{selectedAnomaly.confidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700">Detected At</span>
                  <span className="font-medium text-amber-900">{formatDate(selectedAnomaly.detectedAt)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              {selectedAnomaly.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleUpdateStatus(selectedAnomaly.id, 'dismissed')}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleUpdateStatus(selectedAnomaly.id, 'investigating')}
                  >
                    Start Investigation
                  </Button>
                </>
              )}
              {selectedAnomaly.status === 'investigating' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleUpdateStatus(selectedAnomaly.id, 'dismissed')}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => handleUpdateStatus(selectedAnomaly.id, 'resolved')}
                  >
                    Mark Resolved
                  </Button>
                </>
              )}
              {(selectedAnomaly.status === 'resolved' || selectedAnomaly.status === 'dismissed') && (
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus(selectedAnomaly.id, 'pending')}
                >
                  Reopen
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AnomalyAlerts;
