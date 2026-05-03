import React, { useState, useEffect } from 'react';
import { 
  Search, Users, Eye, Download, Calendar, IndianRupee, TrendingUp,
  ChevronDown, ChevronUp, UserPlus, Phone, Clock, CheckCircle, XCircle,
  Send, Bell, Trash2
} from 'lucide-react';
import { 
  Card, CardContent, Button, Input, Select, Table, Badge, Modal,
  Avatar, Spinner, EmptyState, showToast
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { Column } from '@/components/common/Table';
import api from '@/services/api';

interface MonthlyBreakdown { [key: string]: { amount: number; count: number }; }
interface RecentPayment { id: string; amount: number; date: string; description: string; referenceNumber: string; }

interface Worker {
  id: string; name: string; email?: string; phone?: string; idHash?: string;
  maskedAadhaar?: string; status: 'active' | 'inactive'; totalPaid: number;
  currentMonthPaid: number; currentYearPaid: number; paymentCount: number;
  firstPaymentDate: string | null; lastPaymentDate: string | null;
  monthlyBreakdown: MonthlyBreakdown; recentPayments: RecentPayment[];
}

interface WorkersSummary {
  totalWorkers: number; activeWorkers: number; inactiveWorkers: number; totalPaidAllWorkers: number;
}

interface WorkerRequestItem {
  _id: string; employerName: string; workerName: string; workerPhone: string;
  status: 'pending' | 'accepted' | 'rejected'; message?: string;
  createdAt: string; respondedAt?: string;
  workerId?: { name: string; phone: string };
}

const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [summary, setSummary] = useState<WorkersSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('totalPaid');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerPayments, setWorkerPayments] = useState<any>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [currentPage, _setCurrentPage] = useState(1);
  const pageSize = 10;

  // Add Worker Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Worker Requests
  const [requests, setRequests] = useState<WorkerRequestItem[]>([]);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<WorkerRequestItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { fetchWorkers(); fetchRequests(); fetchNotifications(); }, [sortBy, sortOrder]);

  const fetchWorkers = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/employers/profile/workers/detailed', {
        params: { sortBy, order: sortOrder }
      }) as { data: { workers: Worker[]; summary: WorkersSummary } };
      setWorkers(response.data.workers);
      setSummary(response.data.summary);
    } catch (err) {
      console.error('Failed to fetch workers:', err);
      showToast.error('Failed to load workers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setRequestsLoading(true);
      const response = await api.get('/employers/profile/workers/requests') as { data: { requests: WorkerRequestItem[] } };
      setRequests(response.data.requests || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/employers/profile/notifications') as { data: { notifications: WorkerRequestItem[]; unreadCount: number } };
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const fetchWorkerPayments = async (workerId: string) => {
    try {
      setLoadingPayments(true);
      const response = await api.get(`/employers/profile/workers/${workerId}/payments`) as { data: any };
      setWorkerPayments(response.data);
    } catch (err) {
      console.error('Failed to fetch worker payments:', err);
      showToast.error('Failed to load payment details');
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleViewWorker = async (worker: Worker) => {
    setSelectedWorker(worker);
    await fetchWorkerPayments(worker.id);
  };

  const handleAddWorker = async () => {
    if (!addPhone.trim()) { showToast.error('Please enter a mobile number'); return; }
    try {
      setAddLoading(true);
      await api.post('/employers/profile/workers/request', { phone: addPhone.trim(), message: addMessage.trim() || undefined });
      showToast.success('Worker request sent successfully!');
      setShowAddModal(false);
      setAddPhone('');
      setAddMessage('');
      fetchRequests();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to send worker request');
    } finally {
      setAddLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await api.delete(`/employers/profile/workers/requests/${requestId}`);
      showToast.success('Request cancelled');
      fetchRequests();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to cancel request');
    }
  };

  const handleMarkRead = async (requestId: string) => {
    try {
      await api.put(`/employers/profile/workers/requests/${requestId}/read`);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = 
      worker.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.phone?.includes(searchQuery) ||
      worker.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || worker.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const paginatedWorkers = filteredWorkers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: string) => {
    if (sortBy === field) { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];
  const sortOptions = [
    { value: 'totalPaid', label: 'Total Paid' },
    { value: 'name', label: 'Name' },
    { value: 'lastPayment', label: 'Last Payment' },
    { value: 'paymentCount', label: 'Payment Count' },
  ];

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const respondedRequests = requests.filter(r => r.status !== 'pending');

  const columns: Column<Worker>[] = [
    {
      key: 'name', header: 'Worker', sortable: true,
      render: (worker) => (
        <div className="flex items-center gap-3">
          <Avatar name={worker.name || 'Unknown'} size="sm" />
          <div>
            <p className="font-medium text-gray-900">{worker.name || 'Unknown'}</p>
            <p className="text-xs text-gray-500">{worker.phone || 'No phone'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'payments', header: 'Payments',
      render: (worker) => (
        <div className="text-sm">
          <p className="font-medium text-gray-900">{worker.paymentCount} payments</p>
          <p className="text-gray-500">This month: {formatCurrency(worker.currentMonthPaid)}</p>
        </div>
      ),
    },
    {
      key: 'totalPaid', header: 'Total Paid', sortable: true,
      render: (worker) => (
        <div>
          <span className="font-semibold text-gray-900">{formatCurrency(worker.totalPaid)}</span>
          <p className="text-xs text-gray-500">This year: {formatCurrency(worker.currentYearPaid)}</p>
        </div>
      ),
    },
    {
      key: 'lastPayment', header: 'Last Payment',
      render: (worker) => (
        <div className="text-sm">
          <p className="text-gray-900">
            {worker.lastPaymentDate ? formatDate(worker.lastPaymentDate) : 'No payments yet'}
          </p>
          <p className="text-gray-500">
            {worker.firstPaymentDate ? `Since ${formatDate(worker.firstPaymentDate)}` : 'Since -'}
          </p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (worker) => (
        <Badge variant={worker.status === 'active' ? 'success' : 'default'}>{worker.status}</Badge>
      ),
    },
    {
      key: 'actions', header: '',
      render: (worker) => (
        <Button variant="ghost" size="sm" onClick={() => handleViewWorker(worker)}>
          <Eye className="h-4 w-4 mr-1" /> View
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (<div className="flex items-center justify-center h-96"><Spinner size="lg" /></div>);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-gray-500 mt-1">Manage and view your workers</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="outline" onClick={() => { setShowRequestsPanel(!showRequestsPanel); fetchNotifications(); }}>
              <Bell className="h-4 w-4 mr-2" />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </Button>
          </div>
          <Button variant="outline" onClick={() => fetchWorkers()}>Refresh</Button>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export</Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Worker
          </Button>
        </div>
      </div>

      {/* Notifications Panel */}
      {showRequestsPanel && (
        <Card className="border-2 border-blue-200 bg-blue-50/50">
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" /> Request Status & Notifications
            </h3>

            {/* Unread Notifications */}
            {notifications.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">New Responses</h4>
                <div className="space-y-2">
                  {notifications.map(n => (
                    <div key={n._id} className={`flex items-center justify-between p-3 rounded-lg ${n.status === 'accepted' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center gap-3">
                        {n.status === 'accepted' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
                        <div>
                          <p className="font-medium text-gray-900">
                            {n.workerId?.name || n.workerName} has <span className={n.status === 'accepted' ? 'text-green-700' : 'text-red-600'}>{n.status}</span> your request
                          </p>
                          <p className="text-xs text-gray-500">{n.workerPhone} • {n.respondedAt ? formatDate(n.respondedAt) : formatDate(n.createdAt)}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n._id)}>Dismiss</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Pending Requests ({pendingRequests.length})</h4>
                <div className="space-y-2">
                  {pendingRequests.map(r => (
                    <div key={r._id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-gray-900">{r.workerId?.name || r.workerName || r.workerPhone}</p>
                          <p className="text-xs text-gray-500">{r.workerPhone} • Sent {formatDate(r.createdAt)}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleCancelRequest(r._id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Responded History */}
            {respondedRequests.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">History</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {respondedRequests.slice(0, 10).map(r => (
                    <div key={r._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {r.status === 'accepted' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
                        <div>
                          <p className="text-sm text-gray-900">{r.workerId?.name || r.workerName || r.workerPhone}</p>
                          <p className="text-xs text-gray-500">{r.respondedAt ? formatDate(r.respondedAt) : formatDate(r.createdAt)}</p>
                        </div>
                      </div>
                      <Badge variant={r.status === 'accepted' ? 'success' : 'error'}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notifications.length === 0 && pendingRequests.length === 0 && respondedRequests.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No requests or notifications yet</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Workers</p>
                <p className="text-2xl font-bold text-gray-900">{summary?.totalWorkers || workers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {summary?.activeWorkers || workers.filter(w => w.status === 'active').length}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Requests</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Paid</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(summary?.totalPaidAllWorkers || workers.reduce((sum, w) => sum + w.totalPaid, 0))}
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} className="w-full md:w-40" />
            <Select options={sortOptions} value={sortBy} onChange={(val) => setSortBy(val)} className="w-full md:w-40" />
            <Button variant="outline" onClick={() => toggleSort(sortBy)}>
              {sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workers Table */}
      <Card>
        <CardContent className="p-0">
          {filteredWorkers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No workers found"
              description={workers.length === 0 ? "You haven't added any workers yet. Click 'Add Worker' to get started." : "Adjust your filters to find workers"}
            />
          ) : (
            <Table<Worker> data={paginatedWorkers} columns={columns} keyField="id" />
          )}
        </CardContent>
      </Card>

      {/* Add Worker Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setAddPhone(''); setAddMessage(''); }}
        title="Add Worker"
        description="Enter the worker's mobile number to send them a request. They'll be notified and can accept or decline."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number *</label>
            <Input
              placeholder="Enter worker's mobile number (e.g. 9876543210)"
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              leftIcon={<Phone className="h-4 w-4" />}
            />
            <p className="text-xs text-gray-500 mt-1">The worker must be registered on the platform</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message (Optional)</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              placeholder="Add a message for the worker..."
              value={addMessage}
              onChange={(e) => setAddMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowAddModal(false); setAddPhone(''); setAddMessage(''); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddWorker} isLoading={addLoading} disabled={!addPhone.trim()}>
              <Send className="h-4 w-4 mr-2" /> Send Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Worker Detail Modal */}
      <Modal
        isOpen={!!selectedWorker}
        onClose={() => { setSelectedWorker(null); setWorkerPayments(null); }}
        title="Worker Payment Details"
        size="lg"
      >
        {selectedWorker && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar name={selectedWorker.name || 'Unknown'} size="lg" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{selectedWorker.name}</h3>
                <p className="text-gray-500">{selectedWorker.phone || 'No phone'}</p>
                <Badge variant={selectedWorker.status === 'active' ? 'success' : 'default'} className="mt-1">{selectedWorker.status}</Badge>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary-600">{formatCurrency(selectedWorker.totalPaid)}</p>
                <p className="text-sm text-gray-500">Total Paid</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-xl font-bold text-blue-600">{formatCurrency(selectedWorker.currentMonthPaid)}</p>
                <p className="text-sm text-gray-600">This Month</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-xl font-bold text-green-600">{formatCurrency(selectedWorker.currentYearPaid)}</p>
                <p className="text-sm text-gray-600">This Year</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg text-center">
                <p className="text-xl font-bold text-purple-600">{selectedWorker.paymentCount}</p>
                <p className="text-sm text-gray-600">Total Payments</p>
              </div>
            </div>
            {loadingPayments ? (
              <div className="flex justify-center py-8"><Spinner size="md" /></div>
            ) : workerPayments ? (
              <>
                {workerPayments.yearlyBreakdown && Object.keys(workerPayments.yearlyBreakdown).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Yearly Breakdown</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(workerPayments.yearlyBreakdown).sort(([a], [b]) => Number(b) - Number(a)).map(([year, data]: [string, any]) => (
                        <div key={year} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-gray-900">{year}</p>
                          <p className="text-lg font-bold text-gray-700">{formatCurrency(data.amount)}</p>
                          <p className="text-xs text-gray-500">{data.count} payments</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {workerPayments.monthlyBreakdown && Object.keys(workerPayments.monthlyBreakdown).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Monthly Breakdown (Last 12 Months)</h4>
                    <div className="max-h-48 overflow-y-auto">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(workerPayments.monthlyBreakdown).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([monthKey, data]: [string, any]) => {
                          const [year, month] = monthKey.split('-');
                          const date = new Date(Number(year), Number(month) - 1);
                          return (
                            <div key={monthKey} className="p-2 bg-gray-50 rounded text-sm">
                              <p className="font-medium text-gray-700">{date.toLocaleString('default', { month: 'short', year: 'numeric' })}</p>
                              <p className="text-gray-900 font-semibold">{formatCurrency(data.amount)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {workerPayments.payments && workerPayments.payments.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Recent Payments</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {workerPayments.payments.slice(0, 10).map((payment: any) => (
                        <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900">{payment.description || 'Wage Payment'}</p>
                            <p className="text-xs text-gray-500">{formatDate(payment.date)} • {payment.paymentMethod}</p>
                          </div>
                          <p className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => { setSelectedWorker(null); setWorkerPayments(null); }}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Workers;
