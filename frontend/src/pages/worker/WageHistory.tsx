import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Calendar,
  Building2,
  IndianRupee,
  CheckCircle,
  Eye,
  ShieldCheck,
  ShieldX,
  User
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

interface WageRecord {
  id: string;
  employer: string;
  employerName: string;
  employerId: string;
  companyName: string;
  amount: number;
  date: string;
  status: 'verified' | 'pending' | 'disputed' | 'completed';
  paymentMethod: string;
  workType: string;
  hours?: number;
  transactionHash: string;
  blockNumber: number;
  incomeSource: string;
  isVerified: boolean;
  source: string;
  description?: string;
  verifiedOnChain: boolean;
}

// Mock data removed - now fetching from API

const WageHistory: React.FC = () => {
  const [records, setRecords] = useState<WageRecord[]>([]);
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; amount: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState<WageRecord | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setIsLoading(true);
        // Fetch transactions from API
        const response = await get<{ success: boolean; data: { transactions: any[]; summary: any } }>('/workers/profile/transactions');
        if (response.success && response.data?.transactions) {
          // Map API response to WageRecord format
          const mappedRecords: WageRecord[] = response.data.transactions.map((t) => ({
            id: t.id || t._id,
            employer: t.incomeSource || t.employerDetails?.companyName || 'Unknown Source',
            employerName: t.employerDetails?.name || t.paidByName || '',
            employerId: t.employerId || '',
            companyName: t.employerDetails?.companyName || t.incomeSource || '',
            amount: t.amount || 0,
            date: t.date || t.createdAt,
            status: t.isVerified ? 'verified' as const : 'pending' as const,
            paymentMethod: t.paymentMethod || 'Cash',
            workType: t.workType || t.description || 'General Labor',
            transactionHash: t.blockchainTxId || '',
            blockNumber: t.blockNumber || 0,
            incomeSource: t.incomeSource || 'Self Declared',
            isVerified: t.isVerified || false,
            source: t.source || 'self_declared',
            description: t.description || '',
            verifiedOnChain: t.verifiedOnChain || !!t.blockchainTxId
          }));
          setRecords(mappedRecords);
          
          // Calculate monthly data from transactions
          const monthlyMap: Record<string, number> = {};
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          mappedRecords.forEach((r) => {
            const d = new Date(r.date);
            const monthKey = months[d.getMonth()];
            monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + r.amount;
          });
          
          const monthlyArr = months.map(m => ({ month: m, amount: monthlyMap[m] || 0 })).filter(m => m.amount > 0);
          setMonthlyData(monthlyArr.length > 0 ? monthlyArr : [{ month: 'No Data', amount: 0 }]);
        }
      } catch (error) {
        console.error('Failed to fetch wage records:', error);
        // Fallback to empty
        setRecords([]);
        setMonthlyData([{ month: 'No Data', amount: 0 }]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecords();
  }, []);

  const filteredRecords = records.filter(record => {
    const matchesSearch = (record.employer || record.incomeSource || record.companyName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'verified' && record.isVerified) ||
      (statusFilter === 'unverified' && !record.isVerified);
    
    // Date range filter
    let matchesDate = true;
    if (dateRange !== 'all') {
      const recordDate = new Date(record.date);
      const now = new Date();
      switch (dateRange) {
        case '7d':
          matchesDate = recordDate >= new Date(now.setDate(now.getDate() - 7));
          break;
        case '30d':
          matchesDate = recordDate >= new Date(now.setDate(now.getDate() - 30));
          break;
        case '90d':
          matchesDate = recordDate >= new Date(now.setDate(now.getDate() - 90));
          break;
        case '1y':
          matchesDate = recordDate >= new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }
    }
    
    // Payment method filter
    const matchesPaymentMethod = paymentMethodFilter === 'all' || 
      record.paymentMethod.toLowerCase() === paymentMethodFilter.toLowerCase();
    
    // Source filter (employer vs self-declared)
    const matchesSource = sourceFilter === 'all' ||
      (sourceFilter === 'employer' && record.source === 'employer') ||
      (sourceFilter === 'self_declared' && record.source !== 'employer');
    
    return matchesSearch && matchesStatus && matchesDate && matchesPaymentMethod && matchesSource;
  });

  const totalEarnings = filteredRecords.reduce((sum, r) => sum + r.amount, 0);
  const verifiedCount = filteredRecords.filter(r => r.isVerified).length;
  const unverifiedCount = filteredRecords.filter(r => !r.isVerified).length;
  const verifiedAmount = filteredRecords.filter(r => r.isVerified).reduce((sum, r) => sum + r.amount, 0);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'verified', label: 'Verified Only' },
    { value: 'unverified', label: 'Unverified Only' },
  ];

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' },
  ];

  const paymentMethodOptions = [
    { value: 'all', label: 'All Payment Methods' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'upi', label: 'UPI' },
    { value: 'cash', label: 'Cash' },
    { value: 'cheque', label: 'Cheque' },
  ];

  const sourceOptions = [
    { value: 'all', label: 'All Sources' },
    { value: 'employer', label: 'Employer Payments' },
    { value: 'self_declared', label: 'Self Declared' },
  ];

  const columns: Column<WageRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (record) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <div>
            <span className="block">{formatDate(record.date)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Organization / Source',
      sortable: true,
      render: (record) => (
        <div className="flex items-center gap-2">
          {record.source === 'employer' || record.employerId ? (
            <Building2 className="h-4 w-4 text-blue-500" />
          ) : (
            <User className="h-4 w-4 text-gray-400" />
          )}
          <div>
            <p className="font-medium text-gray-900">{record.companyName || record.incomeSource || record.employer}</p>
            {record.employerName && (
              <p className="text-xs text-blue-600">Paid by: {record.employerName}</p>
            )}
            <p className="text-xs text-gray-500">
              {record.source === 'employer' || record.employerId ? '✓ Employer Payment' : '○ Self Declared'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'workType',
      header: 'Work Type',
      render: (record) => (
        <div>
          <p className="text-gray-600">{record.workType}</p>
          {record.description && record.description !== record.workType && (
            <p className="text-xs text-gray-400">{record.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (record) => (
        <div className="flex items-center gap-1">
          <IndianRupee className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-gray-900">{formatCurrency(record.amount)}</span>
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment Method',
      render: (record) => (
        <div className="flex items-center gap-1">
          <span className="text-gray-600 capitalize">{record.paymentMethod?.replace('_', ' ')}</span>
          {record.verifiedOnChain && (
            <span title="Verified on Blockchain">
              <CheckCircle className="h-3 w-3 text-green-500" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'isVerified',
      header: 'Status',
      render: (record) => (
        <div className="flex items-center gap-2">
          {record.isVerified ? (
            <Badge variant="success" className="flex items-center gap-1 w-fit">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
          ) : (
            <Badge variant="warning" className="flex items-center gap-1 w-fit">
              <ShieldX className="h-3 w-3" />
              Unverified
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (record) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedRecord(record)}
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
          <h1 className="text-2xl font-bold text-gray-900">Wage History</h1>
          <p className="text-gray-500 mt-1">View and track all your wage records</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Records
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Earnings</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalEarnings)}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary-100">
                <IndianRupee className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Verified Amount</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(verifiedAmount)}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-100">
                <ShieldCheck className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Verified Records</p>
                <p className="text-2xl font-bold text-green-600">{verifiedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unverified Records</p>
                <p className="text-2xl font-bold text-amber-600">{unverifiedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-100">
                <ShieldX className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Earnings Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomAreaChart
            data={monthlyData.map(d => ({ name: d.month, amount: d.amount }))}
            areas={[{ dataKey: 'amount', color: CHART_COLORS.array[0], name: 'Earnings' }]}
            xAxisKey="name"
            height={200}
            showLegend={false}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <Input
                placeholder="Search by employer, company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              className="w-full"
            />
            <Select
              options={sourceOptions}
              value={sourceFilter}
              onChange={(value) => setSourceFilter(value)}
              className="w-full"
            />
            <Select
              options={paymentMethodOptions}
              value={paymentMethodFilter}
              onChange={(value) => setPaymentMethodFilter(value)}
              className="w-full"
            />
            <Select
              options={dateRangeOptions}
              value={dateRange}
              onChange={(value) => setDateRange(value)}
              className="w-full"
            />
          </div>
          {/* Active Filters Display */}
          {(statusFilter !== 'all' || sourceFilter !== 'all' || paymentMethodFilter !== 'all' || dateRange !== 'all' || searchQuery) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">Active filters:</span>
              {searchQuery && (
                <Badge variant="gray" className="flex items-center gap-1">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-red-500">×</button>
                </Badge>
              )}
              {statusFilter !== 'all' && (
                <Badge variant="gray" className="flex items-center gap-1">
                  {statusOptions.find(o => o.value === statusFilter)?.label}
                  <button onClick={() => setStatusFilter('all')} className="ml-1 hover:text-red-500">×</button>
                </Badge>
              )}
              {sourceFilter !== 'all' && (
                <Badge variant="gray" className="flex items-center gap-1">
                  {sourceOptions.find(o => o.value === sourceFilter)?.label}
                  <button onClick={() => setSourceFilter('all')} className="ml-1 hover:text-red-500">×</button>
                </Badge>
              )}
              {paymentMethodFilter !== 'all' && (
                <Badge variant="gray" className="flex items-center gap-1">
                  {paymentMethodOptions.find(o => o.value === paymentMethodFilter)?.label}
                  <button onClick={() => setPaymentMethodFilter('all')} className="ml-1 hover:text-red-500">×</button>
                </Badge>
              )}
              {dateRange !== 'all' && (
                <Badge variant="gray" className="flex items-center gap-1">
                  {dateRangeOptions.find(o => o.value === dateRange)?.label}
                  <button onClick={() => setDateRange('all')} className="ml-1 hover:text-red-500">×</button>
                </Badge>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSourceFilter('all');
                  setPaymentMethodFilter('all');
                  setDateRange('all');
                }}
                className="text-red-500 hover:text-red-700"
              >
                Clear All
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No wage records found"
              description="Try adjusting your filters or search query"
            />
          ) : (
            <Table
              data={filteredRecords}
              columns={columns}
              keyField="id"
            />
          )}
        </CardContent>
      </Card>

      {/* Record Detail Modal */}
      <Modal
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title="Wage Record Details"
        size="lg"
      >
        {selectedRecord && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Income Source</p>
                <p className="font-medium text-gray-900">{selectedRecord.incomeSource || selectedRecord.employer}</p>
                <p className="text-xs text-gray-500">
                  {selectedRecord.source === 'employer' || selectedRecord.employerId ? 'Employer Payment' : 'Self Declared'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="font-medium text-gray-900">{formatCurrency(selectedRecord.amount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date & Time</p>
                <p className="font-medium text-gray-900">{formatDateTime(selectedRecord.date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-medium text-gray-900">{selectedRecord.paymentMethod}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Work Type</p>
                <p className="font-medium text-gray-900">{selectedRecord.workType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Verification Status</p>
                {selectedRecord.isVerified ? (
                  <Badge variant="success" className="flex items-center gap-1 w-fit">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="warning" className="flex items-center gap-1 w-fit">
                    <ShieldX className="h-3 w-3" />
                    Unverified
                  </Badge>
                )}
              </div>
            </div>

            {/* Verification Info */}
            <div className={`p-4 rounded-lg ${selectedRecord.isVerified ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
              <div className="flex items-start gap-3">
                {selectedRecord.isVerified ? (
                  <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <ShieldX className="h-5 w-5 text-orange-600 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium ${selectedRecord.isVerified ? 'text-green-800' : 'text-orange-800'}`}>
                    {selectedRecord.isVerified ? 'Income Verified' : 'Income Not Verified'}
                  </p>
                  <p className={`text-sm mt-1 ${selectedRecord.isVerified ? 'text-green-700' : 'text-orange-700'}`}>
                    {selectedRecord.isVerified 
                      ? 'This income was paid directly by an employer and is verified on the system.'
                      : 'This income is self-declared and not verified by an employer. Self-declared income may receive lower weightage in welfare calculations.'
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-900 mb-3">Blockchain Details</h4>
              <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Transaction Hash</p>
                  <p className="text-sm font-mono text-gray-700 break-all">{selectedRecord.transactionHash || 'Not recorded on blockchain'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Block Number</p>
                  <p className="text-sm font-mono text-gray-700">{selectedRecord.blockNumber || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WageHistory;
