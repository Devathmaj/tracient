import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, Building2, Clock } from 'lucide-react';
import { Card, CardContent, Button, Badge, Spinner, showToast } from '@/components/common';
import { formatDate } from '@/utils/formatters';
import api from '@/services/api';

interface WorkerRequest {
  _id: string;
  employerName: string;
  workerPhone: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  respondedAt?: string;
}

const WorkerRequestsPanel: React.FC = () => {
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/workers/profile/requests') as { data: { requests: WorkerRequest[] } };
      setRequests(response.data.requests || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      setRespondingId(requestId);
      await api.put(`/workers/profile/requests/${requestId}/respond`, { action });
      showToast.success(action === 'accept' ? 'Request accepted! You are now linked to this employer.' : 'Request declined.');
      fetchRequests();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to respond to request');
    } finally {
      setRespondingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const pastRequests = requests.filter(r => r.status !== 'pending');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Spinner size="sm" />
          <span className="ml-2 text-gray-500 text-sm">Loading requests...</span>
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50">
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-yellow-600" />
              Employer Requests
              <Badge variant="warning">{pendingRequests.length} pending</Badge>
            </h3>
            <div className="space-y-3">
              {pendingRequests.map(request => (
                <div key={request._id} className="bg-white rounded-xl p-4 border border-yellow-200 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-base">
                        {request.employerName}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        has sent you a request to add you as a worker
                      </p>
                      {request.message && (
                        <p className="text-sm text-gray-500 mt-2 italic bg-gray-50 p-2 rounded">
                          "{request.message}"
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(request.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4 ml-10">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRespond(request._id, 'accept')}
                      isLoading={respondingId === request._id}
                      disabled={respondingId !== null}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" /> Accept
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRespond(request._id, 'reject')}
                      isLoading={respondingId === request._id}
                      disabled={respondingId !== null}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past Requests (collapsed) */}
      {pastRequests.length > 0 && pendingRequests.length === 0 && (
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Recent Employer Requests</h4>
            <div className="space-y-2">
              {pastRequests.slice(0, 3).map(request => (
                <div key={request._id} className="flex items-center justify-between p-2 bg-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{request.employerName}</span>
                  </div>
                  <Badge variant={request.status === 'accepted' ? 'success' : 'error'} >
                    {request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WorkerRequestsPanel;
