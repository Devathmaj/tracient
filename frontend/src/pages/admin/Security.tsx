import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Key,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  RefreshCw
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardDescription,
  Button,
  Badge,
  Select,
  Switch,
  Spinner
} from '@/components/common';
import { formatDate } from '@/utils/formatters';
import api from '@/services/api';

interface SecurityEvent {
  id: string;
  type: 'login' | 'failed_login' | 'permission_change' | 'api_access';
  user: string;
  action: string;
  timestamp: string;
  ipAddress: string;
  status: 'success' | 'failed' | 'warning';
}

const Security: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [securityStats, setSecurityStats] = useState({
    successfulLogins: 0,
    failedAttempts: 0,
    activeApiKeys: 0,
    securityScore: 99.9
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [passwordPolicy, setPasswordPolicy] = useState('strong');
  const [showApiKey, setShowApiKey] = useState(false);
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => {
    const fetchSecurityData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch audit logs for security events
        const response = await api.get('/admin/audit-logs', {
          params: { limit: 50 }
        });
        
        const logs = response.data?.data || [];
        
        // Map audit logs to security events
        const mappedEvents: SecurityEvent[] = logs.map((log: any) => {
          // Determine event type based on action
          let eventType: SecurityEvent['type'] = 'api_access';
          let status: SecurityEvent['status'] = 'success';
          
          const action = (log.action || '').toLowerCase();
          if (action.includes('login')) {
            eventType = action.includes('failed') ? 'failed_login' : 'login';
            status = action.includes('failed') ? 'failed' : 'success';
          } else if (action.includes('permission') || action.includes('role') || action.includes('user')) {
            eventType = 'permission_change';
            status = 'warning';
          }
          
          return {
            id: log._id,
            type: eventType,
            user: log.user?.email || log.metadata?.email || 'System',
            action: log.action || 'Unknown action',
            timestamp: log.createdAt || log.timestamp,
            ipAddress: log.metadata?.ipAddress || log.ipAddress || 'N/A',
            status
          };
        });
        
        setEvents(mappedEvents);
        
        // Calculate security stats from events
        const successLogins = mappedEvents.filter(e => e.type === 'login').length;
        const failedLogins = mappedEvents.filter(e => e.type === 'failed_login').length;
        
        setSecurityStats({
          successfulLogins: successLogins,
          failedAttempts: failedLogins,
          activeApiKeys: 8, // This would come from a separate API if available
          securityScore: failedLogins > 0 ? Math.max(90, 99.9 - (failedLogins * 0.5)) : 99.9
        });
      } catch (err) {
        console.error('Error fetching security data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSecurityData();
  }, []);

  const filteredEvents = eventFilter === 'all' 
    ? events 
    : events.filter(e => e.type === eventFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="success">Success</Badge>;
      case 'failed':
        return <Badge variant="error">Failed</Badge>;
      case 'warning':
        return <Badge variant="warning">Warning</Badge>;
      default:
        return <Badge variant="default">Unknown</Badge>;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'login':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed_login':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'permission_change':
        return <Users className="h-5 w-5 text-amber-500" />;
      case 'api_access':
        return <Key className="h-5 w-5 text-blue-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
          <p className="text-gray-500 mt-1">Manage system security and access control</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            Security Active
          </Badge>
        </div>
      </div>

      {/* Security Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{securityStats.successfulLogins}</p>
            <p className="text-sm text-gray-500">Successful Logins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{securityStats.failedAttempts}</p>
            <p className="text-sm text-gray-500">Failed Attempts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Key className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{securityStats.activeApiKeys}</p>
            <p className="text-sm text-gray-500">Active API Keys</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{securityStats.securityScore.toFixed(1)}%</p>
            <p className="text-sm text-gray-500">Security Score</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Security Policies */}
        <Card>
          <CardHeader>
            <CardTitle>Security Policies</CardTitle>
            <CardDescription>Configure authentication and access control</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                <p className="text-sm text-gray-500">Require 2FA for all admin users</p>
              </div>
              <Switch checked={twoFactorEnabled} onChange={setTwoFactorEnabled} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Session Timeout (minutes)</label>
              <Select 
                value={sessionTimeout} 
                onChange={setSessionTimeout}
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password Policy</label>
              <Select 
                value={passwordPolicy} 
                onChange={setPasswordPolicy}
                options={[
                  { value: 'basic', label: 'Basic (8+ characters)' },
                  { value: 'moderate', label: 'Moderate (10+ chars, mixed case)' },
                  { value: 'strong', label: 'Strong (12+ chars, special chars)' },
                ]}
              />
            </div>

            <div className="pt-4 border-t">
              <Button className="w-full">Save Security Settings</Button>
            </div>
          </CardContent>
        </Card>

        {/* API Key Management */}
        <Card>
          <CardHeader>
            <CardTitle>API Key Management</CardTitle>
            <CardDescription>Manage API access keys</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Production API Key</span>
                <Button variant="outline" size="sm" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-white px-3 py-2 rounded border border-gray-300 font-mono">
                  {showApiKey ? 'example_api_key_replace_with_real' : '••••••••••••••••••••••••••••••••••••'}
                </code>
                <Button variant="outline" size="sm">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Development API Key</span>
                <Badge variant="primary">Active</Badge>
              </div>
              <p className="text-sm text-blue-700">Last used: 2 hours ago</p>
            </div>

            <div className="flex gap-3">
              <Button className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate New Key
              </Button>
              <Button variant="outline">Revoke All</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Security Events</CardTitle>
            <Select 
              value={eventFilter} 
              onChange={setEventFilter}
              options={[
                { value: 'all', label: 'All Events' },
                { value: 'login', label: 'Logins' },
                { value: 'failed_login', label: 'Failed Logins' },
                { value: 'permission_change', label: 'Permission Changes' },
                { value: 'api_access', label: 'API Access' },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="mt-1">
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{event.action}</p>
                    {getStatusBadge(event.status)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{event.user}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span>{formatDate(event.timestamp)}</span>
                    <span>IP: {event.ipAddress}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Security;
