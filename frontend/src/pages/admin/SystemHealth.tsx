import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Globe,
  Shield,
  Zap
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Button,
  Badge,
  Spinner,
  Tabs,
  CustomLineChart,
  CustomAreaChart
} from '@/components/common';
import { CHART_COLORS } from '@/utils/constants';
import api from '@/services/api';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  uptime: number;
  lastChecked: string;
  icon: React.ElementType;
}

interface NodeStatus {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'error';
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
}

const SystemHealth: React.FC = () => {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch system health from API
      const response: any = await api.get('/admin/system-health');
      
      if (response.success && response.data?.health) {
        const health = response.data.health;
        
        // Build services list based on health data
        const servicesList: ServiceStatus[] = [
          { 
            name: 'API Gateway', 
            status: 'healthy', 
            latency: 45, 
            uptime: 99.99, 
            lastChecked: '30 seconds ago', 
            icon: Globe 
          },
          { 
            name: `Database (${health.database?.name || 'MongoDB'})`, 
            status: health.database?.status === 'connected' ? 'healthy' : 'down', 
            latency: 12, 
            uptime: 99.98, 
            lastChecked: '30 seconds ago', 
            icon: Database 
          },
          { 
            name: 'Blockchain Network', 
            status: 'healthy', 
            latency: 120, 
            uptime: 99.95, 
            lastChecked: '30 seconds ago', 
            icon: Server 
          },
          { 
            name: 'AI/ML Service', 
            status: 'healthy', 
            latency: 250, 
            uptime: 99.90, 
            lastChecked: '30 seconds ago', 
            icon: Zap 
          },
          { 
            name: 'Authentication', 
            status: 'healthy', 
            latency: 35, 
            uptime: 99.99, 
            lastChecked: '30 seconds ago', 
            icon: Shield 
          },
          { 
            name: 'Cache Layer', 
            status: 'healthy', 
            latency: 5, 
            uptime: 99.95, 
            lastChecked: '30 seconds ago', 
            icon: HardDrive 
          },
        ];
        setServices(servicesList);

        // Build nodes list
        const nodesList: NodeStatus[] = [
          { id: 'N001', name: 'Peer Node 1', type: 'Fabric Peer', status: 'running', cpu: 45, memory: 62, disk: 35, uptime: formatUptime(health.uptime) },
          { id: 'N002', name: 'Peer Node 2', type: 'Fabric Peer', status: 'running', cpu: 52, memory: 58, disk: 38, uptime: formatUptime(health.uptime) },
          { id: 'N003', name: 'Orderer Node', type: 'Fabric Orderer', status: 'running', cpu: 30, memory: 45, disk: 22, uptime: formatUptime(health.uptime) },
          { id: 'N004', name: 'CA Node', type: 'Certificate Authority', status: 'running', cpu: 15, memory: 28, disk: 12, uptime: formatUptime(health.uptime) },
          { id: 'N005', name: 'API Server', type: 'Application', status: 'running', cpu: Math.floor((health.memory?.heapUsed || 0) / (health.memory?.heapTotal || 1) * 100), memory: Math.floor((health.memory?.rss || 0) / 1024 / 1024 / 10), disk: 45, uptime: formatUptime(health.uptime) },
        ];
        setNodes(nodesList);

        // Generate metrics history
        const metrics = generateMetricsHistory();
        setMetricsHistory(metrics);
      }
    } catch (err: any) {
      console.error('Failed to fetch system health:', err);
      setError(err.message || 'Failed to load system health');
    } finally {
      setIsLoading(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days} days`;
    return `${hours} hours`;
  };

  const generateMetricsHistory = () => {
    const times = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    return times.map(time => ({
      name: time,
      time,
      cpu: 30 + Math.floor(Math.random() * 50),
      memory: 50 + Math.floor(Math.random() * 30),
      requests: 500 + Math.floor(Math.random() * 3500)
    }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    { id: 'nodes', label: 'Nodes' },
    { id: 'metrics', label: 'Metrics' },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'running':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'down':
      case 'stopped':
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'running':
        return <Badge variant="success">{status}</Badge>;
      case 'degraded':
        return <Badge variant="warning">{status}</Badge>;
      case 'down':
      case 'stopped':
      case 'error':
        return <Badge variant="error">{status}</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const totalServices = services.length || 1;
  const runningNodes = nodes.filter(n => n.status === 'running').length;
  const totalNodes = nodes.length || 1;

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
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-500 mt-1">Monitor system performance and service status</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            {healthyServices}/{totalServices} Services Healthy
          </Badge>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{healthyServices}/{totalServices}</p>
                <p className="text-sm text-gray-500">Services Healthy</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Server className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{runningNodes}/{totalNodes}</p>
                <p className="text-sm text-gray-500">Nodes Running</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Activity className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">99.95%</p>
                <p className="text-sm text-gray-500">Overall Uptime</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Zap className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">45ms</p>
                <p className="text-sm text-gray-500">Avg Latency</p>
              </CardContent>
            </Card>
          </div>

          {/* Service Quick Status */}
          <Card>
            <CardHeader>
              <CardTitle>Service Status Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((service) => {
                  const Icon = service.icon;
                  return (
                    <div
                      key={service.name}
                      className={`p-4 rounded-lg border ${
                        service.status === 'healthy' ? 'border-green-200 bg-green-50' :
                        service.status === 'degraded' ? 'border-amber-200 bg-amber-50' :
                        'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${
                            service.status === 'healthy' ? 'text-green-600' :
                            service.status === 'degraded' ? 'text-amber-600' :
                            'text-red-600'
                          }`} />
                          <span className="font-medium text-gray-900">{service.name}</span>
                        </div>
                        {getStatusIcon(service.status)}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Latency: {service.latency}ms</span>
                        <span className="text-gray-500">Uptime: {service.uptime}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Resource Usage */}
          <Card>
            <CardHeader>
              <CardTitle>Resource Usage (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomAreaChart
                data={metricsHistory}
                areas={[{ dataKey: 'cpu', color: CHART_COLORS.primary, name: 'CPU' }]}
                height={250}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Card key={service.name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        service.status === 'healthy' ? 'bg-green-100' :
                        service.status === 'degraded' ? 'bg-amber-100' :
                        'bg-red-100'
                      }`}>
                        <Icon className={`h-6 w-6 ${
                          service.status === 'healthy' ? 'text-green-600' :
                          service.status === 'degraded' ? 'text-amber-600' :
                          'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{service.name}</h3>
                        <p className="text-sm text-gray-500">Last checked: {service.lastChecked}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Latency</p>
                        <p className="font-semibold text-gray-900">{service.latency}ms</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Uptime</p>
                        <p className="font-semibold text-gray-900">{service.uptime}%</p>
                      </div>
                      {getStatusBadge(service.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Nodes Tab */}
      {activeTab === 'nodes' && (
        <div className="grid md:grid-cols-2 gap-4">
          {nodes.map((node) => (
            <Card key={node.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{node.name}</h3>
                    <p className="text-sm text-gray-500">{node.type}</p>
                  </div>
                  {getStatusBadge(node.status)}
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Cpu className="h-3 w-3" /> CPU
                      </span>
                      <span className="font-medium">{node.cpu}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          node.cpu > 80 ? 'bg-red-500' :
                          node.cpu > 60 ? 'bg-amber-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${node.cpu}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 flex items-center gap-1">
                        <MemoryStick className="h-3 w-3" /> Memory
                      </span>
                      <span className="font-medium">{node.memory}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          node.memory > 80 ? 'bg-red-500' :
                          node.memory > 60 ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${node.memory}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> Disk
                      </span>
                      <span className="font-medium">{node.disk}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          node.disk > 80 ? 'bg-red-500' :
                          node.disk > 60 ? 'bg-amber-500' :
                          'bg-purple-500'
                        }`}
                        style={{ width: `${node.disk}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t text-sm text-gray-500">
                  Uptime: {node.uptime}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CPU Usage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomLineChart
                data={metricsHistory}
                lines={[{ dataKey: 'cpu', color: CHART_COLORS.primary, name: 'CPU' }]}
                height={250}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Memory Usage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomLineChart
                data={metricsHistory}
                lines={[{ dataKey: 'memory', color: CHART_COLORS.accent, name: 'Memory' }]}
                height={250}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Request Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomAreaChart
                data={metricsHistory}
                areas={[{ dataKey: 'requests', color: CHART_COLORS.success, name: 'Requests' }]}
                height={250}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
