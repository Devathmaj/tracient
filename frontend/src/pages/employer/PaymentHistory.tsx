import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download,
  Calendar,
  CheckCircle,
  Clock,
  User,
  Eye,
  IndianRupee,
  Building2,
  CreditCard,
  Hash,
  AlertCircle
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Button,
  Input,
  Select,
  Table,
  Badge,
  Modal,
  Spinner,
  EmptyState,
  CustomAreaChart
} from '@/components/common';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import { CHART_COLORS } from '@/utils/constants';
import { get } from '@/services/api';
import type { Column } from '@/components/common/Table';

interface PaymentRecord {
  id: string;
  worker: {
    id: string;
    name: string;
  };
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: string;
  workType: string;
  transactionHash?: string;
  blockNumber?: number;
  description?: string;
  isVerified?: boolean;
}

interface DashboardData {
  companyName: string;
  totalPayments: number;
  monthlyPayrollTrend: Array<{ month: string; amount: number }>;
  recentPayments: Array<{
    id: string;
    worker: string;
    workerId: string;
    amount: number;
    date: string;
    status: string;
    paymentMethod: string;
    workType: string;
  }>;
}

const PaymentHistory: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [monthlyData, setMonthlyData] = useState<Array<{ name: string; month: string; amount: number }>>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [currentPage, _setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setIsLoading(true);
        
        // Fetch dashboard data which includes payments
        const response = await get<{ success: boolean; data: DashboardData }>('/employers/profile/dashboard');
        console.log('Payment history response:', response);
        
        if (response.success && response.data) {
          setCompanyName(response.data.companyName);
          
          // Set monthly trend for chart
          const monthlyTrend = response.data.monthlyPayrollTrend.map(m => ({
            name: m.month,
            month: m.month,
            amount: m.amount
          }));
          setMonthlyData(monthlyTrend);
          
          // Transform recent payments to our format
          const transformedPayments: PaymentRecord[] = response.data.recentPayments.map(p => ({
            id: p.id,
            worker: {
              id: p.workerId,
              name: p.worker
            },
            amount: p.amount,
            date: p.date,
            status: p.status as 'completed' | 'pending' | 'failed',
            paymentMethod: p.paymentMethod,
            workType: p.workType || 'Regular'
          }));
          setPayments(transformedPayments);
        }
      } catch (error) {
        console.error('Failed to fetch payments:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.worker.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Paginate filtered payments
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPaid = filteredPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = filteredPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const completedCount = filteredPayments.filter(p => p.status === 'completed').length;
  const pendingCount = filteredPayments.filter(p => p.status === 'pending').length;

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
  ];

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ];

  const columns: Column<PaymentRecord>[] = [
    {
      key: 'id',
      header: 'Payment ID',
      render: (payment) => (
        <span className="font-mono text-sm">{payment.id}</span>
      ),
    },
    {
      key: 'worker',
      header: 'Worker',
      render: (payment) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <User className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{payment.worker.name}</p>
            <p className="text-xs text-gray-500">{payment.worker.id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (payment) => (
        <span className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (payment) => formatDate(payment.date),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (payment) => payment.paymentMethod,
    },
    {
      key: 'status',
      header: 'Status',
      render: (payment) => (
        <Badge
          variant={payment.status === 'completed' ? 'success' : payment.status === 'pending' ? 'warning' : 'error'}
          className="flex items-center gap-1 w-fit"
        >
          {payment.status === 'completed' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {payment.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (payment) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedPayment(payment)}
        >
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-primary-600" />
            <span className="text-lg font-semibold text-primary-600">{companyName}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
          <p className="text-gray-500 mt-1">View all wage payments made to workers</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="h-4 w-4 text-green-600" />
              <p className="text-sm text-gray-500">Total Paid</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-gray-500">Pending Amount</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(pendingAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-gray-500">Completed</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{completedCount} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-gray-500">Pending</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{pendingCount} payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Payment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomAreaChart
            data={monthlyData}
            areas={[{ dataKey: 'amount', color: CHART_COLORS.primary, name: 'Amount' }]}
            xAxisKey="name"
            height={200}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by worker name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-full md:w-40"
            />
            <Select
              options={dateRangeOptions}
              value={dateRange}
              onChange={setDateRange}
              className="w-full md:w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {filteredPayments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No payments found"
              description="Adjust your filters or record a new payment"
            />
          ) : (
            <Table<PaymentRecord>
              data={paginatedPayments}
              columns={columns}
              keyField="id"
            />
          )}
        </CardContent>
      </Card>

      {/* Payment Detail Modal */}
      <Modal
        isOpen={!!selectedPayment}
        onClose={() => setSelectedPayment(null)}
        title="Payment Details"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{selectedPayment.worker.name}</p>
                  <p className="text-sm text-gray-500">Worker</p>
                </div>
              </div>
              <Badge
                variant={selectedPayment.status === 'completed' ? 'success' : 'warning'}
                className="text-sm"
              >
                {selectedPayment.status === 'completed' ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Completed</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" /> Pending</>
                )}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <IndianRupee className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-gray-500">Amount</p>
                </div>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedPayment.amount)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <p className="text-sm text-gray-500">Payment Date</p>
                </div>
                <p className="text-lg font-medium text-gray-900">{formatDateTime(selectedPayment.date)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-gray-500" />
                  <p className="text-sm text-gray-500">Payment Method</p>
                </div>
                <p className="text-lg font-medium text-gray-900">{selectedPayment.paymentMethod || 'Not specified'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4 text-gray-500" />
                  <p className="text-sm text-gray-500">Work Type</p>
                </div>
                <p className="text-lg font-medium text-gray-900">{selectedPayment.workType || 'Regular'}</p>
              </div>
            </div>

            {(selectedPayment.transactionHash || selectedPayment.blockNumber) && (
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Blockchain Details
                </h4>
                <div className="space-y-3 bg-gray-50 p-4 rounded-lg text-sm">
                  {selectedPayment.transactionHash && (
                    <div>
                      <p className="text-gray-500">Transaction Hash</p>
                      <p className="font-mono text-gray-900 break-all">{selectedPayment.transactionHash}</p>
                    </div>
                  )}
                  {selectedPayment.blockNumber && (
                    <div>
                      <p className="text-gray-500">Block Number</p>
                      <p className="font-mono text-gray-900">{selectedPayment.blockNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setSelectedPayment(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PaymentHistory;
