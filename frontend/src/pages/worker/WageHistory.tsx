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
  amount: number;
  date: string;
  source: string;
  employerName: string;
  companyName: string;
  status: string;
  verified: boolean;
  paymentMethod: string;
  description: string;
}

interface DashboardData {
  totalEarnings: number;
  monthlyAverage: number;
  lastPayment: {
    amount: number;
    date: string;
    source: string;
  } | null;
  monthlyIncome: Array<{ month: string; amount: number }>;
  incomeBySource: Array<{ source: string; amount: number; percentage: number }>;
  recentWages: Array<{
    id: string;
    amount: number;
    date: string;
    source: string;
    status: string;
    verified: boolean;
    paymentMethod: string;
  }>;
  verificationBreakdown: {
    verified: number;
    unverified: number;
    verifiedPercentage: number;
  };
}

const WageHistory: React.FC = () => {
  const [records, setRecords] = useState<WageRecord[]>([]);
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; amount: number }>>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardData | null>(null);
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
        
        // First fetch dashboard data to get summary stats and monthly chart
        const dashboardResponse = await get<{ success: boolean; data: DashboardData }>('/workers/profile/dashboard');
        
        if (dashboardResponse.success && dashboardResponse.data) {
          setDashboardStats(dashboardResponse.data);
          setMonthlyData(dashboardResponse.data.monthlyIncome || []);
          
          // Use recentWages from dashboard as base - this is guaranteed to work
          // because dashboard is already showing data
          const dashboardWages = dashboardResponse.data.recentWages || [];
          
          // Try to get full history from wages endpoint with pagination
          try {
            let allWages: WageRecord[] = [];
            let page = 1;
            let hasMore = true;
            
            while (hasMore) {
              const wageResponse = await get<{ success: boolean; data: any[]; pagination?: any; hasNextPage?: boolean; totalPages?: number }>(`/wages?page=${page}&limit=100`);
              
              console.log(`Wage response page ${page}:`, wageResponse);
              
              if (wageResponse.success && wageResponse.data && Array.isArray(wageResponse.data) && wageResponse.data.length > 0) {
                // Map the raw wage records to our format
                const pageWages: WageRecord[] = wageResponse.data.map((w: any) => ({
                  id: w._id || w.id,
                  amount: w.amount || 0,
                  date: w.createdAt || w.date,
                  source: w.employerId?.companyName || w.incomeSource || 'Self Declared',
                  employerName: w.employerId?.name || '',
                  companyName: w.employerId?.companyName || w.incomeSource || 'Self Declared',
                  status: w.status || 'completed',
                  verified: Boolean(w.isVerified || w.employerId || w.verifiedOnChain),
                  paymentMethod: w.paymentMethod || 'cash',
                  description: w.description || w.workType || 'Wage Payment'
                }));
                
                allWages = [...allWages, ...pageWages];
                
                // Check if there are more pages
                hasMore = (wageResponse.pagination?.hasNextPage) || 
                         (wageResponse.hasNextPage) || 
                         (pageWages.length === 100);
                page++;
                
                // Safety check to prevent infinite loops
                if (page > 100) break;
              } else {
                hasMore = false;
              }
            }
            
            console.log(`Total wages fetched: ${allWages.length}`);
            
            if (allWages.length > 0) {
              setRecords(allWages);
            } else {
              // Fallback: convert dashboard recentWages to full format
              const convertedWages: WageRecord[] = dashboardWages.map(w => ({
                id: w.id,
                amount: w.amount,
                date: w.date,
                source: w.source,
                employerName: '',
                companyName: w.source,
                status: w.status,
                verified: w.verified,
                paymentMethod: w.paymentMethod,
                description: 'Wage Payment'
              }));
              setRecords(convertedWages);
            }
          } catch (wageError) {
            console.error('Failed to fetch full wage history:', wageError);
            console.log('Falling back to dashboard wages');
            // Use dashboard wages as fallback
            const convertedWages: WageRecord[] = dashboardWages.map(w => ({
              id: w.id,
              amount: w.amount,
              date: w.date,
              source: w.source,
              employerName: '',
              companyName: w.source,
              status: w.status,
              verified: w.verified,
              paymentMethod: w.paymentMethod,
              description: 'Wage Payment'
            }));
            setRecords(convertedWages);
          }
        } else {
          setRecords([]);
          setMonthlyData([]);
        }
      } catch (error) {
        console.error('Failed to fetch wage records:', error);
        setRecords([]);
        setMonthlyData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecords();
  }, []);

  const filteredRecords = records.filter(record => {
    const searchFields = [
      record.source,
      record.paymentMethod,
      record.status
    ].filter(Boolean).join(' ').toLowerCase();
    
    const matchesSearch = searchFields.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'verified' && record.verified) ||
      (statusFilter === 'pending' && record.status === 'pending') ||
      (statusFilter === 'unverified' && !record.verified);
    
    // Date range filter
    let matchesDate = true;
    if (dateRange !== 'all') {
      const recordDate = new Date(record.date);
      const now = new Date();
      switch (dateRange) {
        case '7d':
          matchesDate = recordDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          matchesDate = recordDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          matchesDate = recordDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          matchesDate = recordDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
      }
    }
    
    // Payment method filter
    const matchesPaymentMethod = paymentMethodFilter === 'all' || 
      record.paymentMethod.toLowerCase() === paymentMethodFilter.toLowerCase();
    
    // Source filter (verified vs unverified)
    const matchesSource = sourceFilter === 'all' ||
      (sourceFilter === 'employer' && record.verified) ||
      (sourceFilter === 'self_declared' && !record.verified);
    
    return matchesSearch && matchesStatus && matchesDate && matchesPaymentMethod && matchesSource;
  });

  // Calculate stats from filtered records, or use dashboard stats as fallback
  const totalEarnings = filteredRecords.length > 0 
    ? filteredRecords.reduce((sum, r) => sum + r.amount, 0)
    : (dashboardStats?.totalEarnings || 0);
  const verifiedCount = filteredRecords.filter(r => r.verified).length;
  const unverifiedCount = filteredRecords.filter(r => !r.verified).length;
  const verifiedAmount = filteredRecords.length > 0
    ? filteredRecords.filter(r => r.verified).reduce((sum, r) => sum + r.amount, 0)
    : (dashboardStats?.verificationBreakdown?.verified || 0);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'verified', label: 'Verified' },
    { value: 'unverified', label: 'Unverified' },
    { value: 'pending', label: 'Pending' },
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
            <span className="block font-medium">{formatDate(record.date)}</span>
            <span className="text-xs text-gray-400">{record.status}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Employer / Source',
      sortable: true,
      render: (record) => (
        <div className="flex items-center gap-2">
          {record.verified ? (
            <Building2 className="h-4 w-4 text-blue-500" />
          ) : (
            <User className="h-4 w-4 text-gray-400" />
          )}
          <div>
            <p className="font-medium text-gray-900">{record.companyName || record.source}</p>
            <p className="text-xs text-gray-500">{record.description}</p>
            <p className="text-xs text-gray-400">
              {record.verified ? '✓ Employer Verified' : '○ Self Declared'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment Method',
      render: (record) => (
        <div>
          <p className="text-gray-600 capitalize">{record.paymentMethod?.replace('_', ' ')}</p>
          <p className="text-xs text-gray-400">{record.status}</p>
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
      key: 'verified',
      header: 'Verification',
      render: (record) => (
        <div className="flex items-center gap-2">
          {record.verified ? (
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
                <p className="text-sm text-gray-500">Company / Employer</p>
                <p className="font-medium text-gray-900">{selectedRecord.companyName || selectedRecord.source}</p>
                {selectedRecord.employerName && (
                  <p className="text-xs text-blue-600">Contact: {selectedRecord.employerName}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(selectedRecord.amount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date & Time</p>
                <p className="font-medium text-gray-900">{formatDateTime(selectedRecord.date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-medium text-gray-900 capitalize">{selectedRecord.paymentMethod?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Work Description</p>
                <p className="font-medium text-gray-900">{selectedRecord.description}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Transaction Status</p>
                <Badge variant={selectedRecord.status === 'completed' ? 'success' : 'warning'} className="w-fit">
                  {selectedRecord.status}
                </Badge>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-500">Verification Status</p>
                {selectedRecord.verified ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="success" className="flex items-center gap-1 w-fit">
                      <ShieldCheck className="h-3 w-3" />
                      Employer Verified
                    </Badge>
                    <span className="text-xs text-green-600">This income is verified by the employer and counts towards welfare calculations.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="warning" className="flex items-center gap-1 w-fit">
                      <ShieldX className="h-3 w-3" />
                      Self Declared
                    </Badge>
                    <span className="text-xs text-orange-600">This income is self-declared and not employer-verified.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Info */}
            <div className={`p-4 rounded-lg ${selectedRecord.verified ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <div className="flex items-start gap-3">
                {selectedRecord.verified ? (
                  <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <ShieldX className="h-5 w-5 text-yellow-600 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium ${selectedRecord.verified ? 'text-green-800' : 'text-yellow-800'}`}>
                    {selectedRecord.verified ? 'Payment Verified' : 'Payment Unverified'}
                  </p>
                  <p className={`text-sm mt-1 ${selectedRecord.verified ? 'text-green-700' : 'text-yellow-700'}`}>
                    {selectedRecord.verified ? 
                      'This payment has been verified by the employer or system.' :
                      'This payment is self-declared and has not been verified by an employer.'
                    }
                  </p>
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
