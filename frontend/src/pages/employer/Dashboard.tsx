import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Wallet, 
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowRight,
  Upload,
  Plus,
  IndianRupee,
  Clock,
  CheckCircle,
  Building2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Button,
  Badge,
  Spinner,
  CustomAreaChart,
  CustomBarChart
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { CHART_COLORS } from '@/utils/constants';
import api from '@/services/api';

interface DashboardData {
  companyName: string;
  totalWorkers: number;
  activeWorkers: number;
  totalPayments: number;
  currentMonthPayroll: number;
  yearlyPayments: number;
  trend: number;
  transactionCount: number;
  monthlyPayrollTrend: Array<{ month: string; year: number; amount: number }>;
  paymentsByCategory: Array<{ category: string; amount: number }>;
  recentPayments: Array<{
    id: string;
    worker: string;
    workerId: string;
    amount: number;
    date: string;
    status: string;
    description: string;
    referenceNumber: string;
  }>;
  lastUpdated: string;
}

const EmployerDashboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await api.get('/employers/profile/dashboard') as { data: DashboardData };
        setData(response.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-red-500 mb-4">{error || 'No data available'}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const stats: Array<{
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: number;
    icon: React.ElementType;
    color: string;
  }> = [
    {
      title: 'Total Workers',
      value: data.totalWorkers,
      subtitle: `${data.activeWorkers} active`,
      icon: Users,
      color: 'primary',
    },
    {
      title: 'Total Payments',
      value: formatCurrency(data.totalPayments),
      trend: data.trend,
      icon: Wallet,
      color: 'accent',
    },
    {
      title: 'Monthly Payroll',
      value: formatCurrency(data.currentMonthPayroll),
      subtitle: 'This month',
      icon: IndianRupee,
      color: 'success',
    },
    {
      title: 'Yearly Payments',
      value: formatCurrency(data.yearlyPayments),
      subtitle: `${data.transactionCount} transactions`,
      icon: Calendar,
      color: 'warning',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your workforce and payments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/employer/record-wage">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Record Wage
            </Button>
          </Link>
          <Link to="/employer/bulk-upload">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                    {stat.trend !== undefined && stat.trend !== 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        {stat.trend > 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className={`text-sm font-medium ${stat.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Math.abs(stat.trend)}%
                        </span>
                        <span className="text-xs text-gray-500">vs last month</span>
                      </div>
                    )}
                    {stat.subtitle && (stat.trend === undefined || stat.trend === 0) && (
                      <p className="text-sm text-gray-500 mt-2">{stat.subtitle}</p>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl bg-${stat.color}-100`}>
                    <Icon className={`h-6 w-6 text-${stat.color}-600`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/employer/record-wage" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="p-3 rounded-xl bg-green-100 mb-3">
                <Plus className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-medium text-gray-900">Record Wage</p>
              <p className="text-xs text-gray-500 mt-1">Add new payment</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/employer/bulk-upload" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="p-3 rounded-xl bg-blue-100 mb-3">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <p className="font-medium text-gray-900">Bulk Upload</p>
              <p className="text-xs text-gray-500 mt-1">CSV/Excel import</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/employer/workers" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="p-3 rounded-xl bg-purple-100 mb-3">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <p className="font-medium text-gray-900">Workers</p>
              <p className="text-xs text-gray-500 mt-1">Manage workforce</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly Payroll Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Payroll Trend (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyPayrollTrend.length > 0 ? (
              <CustomAreaChart
                data={data.monthlyPayrollTrend.map(d => ({ name: `${d.month} ${d.year}`, amount: d.amount }))}
                areas={[{ dataKey: 'amount', color: CHART_COLORS.array[0], name: 'Payroll' }]}
                xAxisKey="name"
                height={250}
                showLegend={false}
              />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No payment data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Payments by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.paymentsByCategory.length > 0 ? (
              <CustomBarChart
                data={data.paymentsByCategory.map(d => ({ name: d.category, amount: d.amount }))}
                bars={[{ dataKey: 'amount', color: CHART_COLORS.array[1], name: 'Amount' }]}
                xAxisKey="name"
                height={250}
                showLegend={false}
              />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Company Info & Recent Payments */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Company Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Company Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p className="font-medium text-gray-900">{data.companyName}</p>
                </div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total Workers</span>
                  <span className="font-medium">{data.totalWorkers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Active Workers</span>
                  <span className="font-medium text-green-600">{data.activeWorkers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total Transactions</span>
                  <span className="font-medium">{data.transactionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Avg. Payment</span>
                  <span className="font-medium">
                    {formatCurrency(data.transactionCount > 0 ? data.totalPayments / data.transactionCount : 0)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Payments</CardTitle>
            <Link to="/employer/payment-history">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentPayments.length > 0 ? (
                data.recentPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-700">
                          {payment.worker.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{payment.worker}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(payment.date)} • {payment.description || 'Wage Payment'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                      <Badge
                        variant={payment.status === 'completed' ? 'success' : 'warning'}
                        className="mt-1"
                      >
                        {payment.status === 'completed' ? (
                          <><CheckCircle className="h-3 w-3 mr-1" /> Completed</>
                        ) : (
                          <><Clock className="h-3 w-3 mr-1" /> Pending</>
                        )}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No payments recorded yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployerDashboard;
