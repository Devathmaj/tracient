import React, { useState, useEffect } from 'react';
import { 
  Heart, 
  Users,
  IndianRupee,
  Calendar,
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
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
  StatCard
} from '@/components/common';
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters';
import api from '@/services/api';

interface WelfareScheme {
  id: string;
  name: string;
  description: string;
  category: string;
  benefitType: 'cash' | 'subsidy' | 'service' | 'insurance';
  benefitAmount: number;
  eligibilityCriteria: string[];
  totalBudget: number;
  disbursed: number;
  beneficiariesCount: number;
  status: 'active' | 'paused' | 'upcoming' | 'expired';
  startDate: string;
  endDate: string;
  ministry: string;
}

const WelfareSchemes: React.FC = () => {
  const [schemes, setSchemes] = useState<WelfareScheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedScheme, setSelectedScheme] = useState<WelfareScheme | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const fetchSchemes = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response: any = await api.get('/government/welfare-schemes');
        
        if (response.success && response.data) {
          const mappedSchemes: WelfareScheme[] = response.data.map((scheme: any) => ({
            id: scheme._id || scheme.id,
            name: scheme.name,
            description: scheme.description || '',
            category: scheme.category || 'General',
            benefitType: scheme.benefitType || 'cash',
            benefitAmount: scheme.benefitAmount || scheme.benefits?.amount || 0,
            eligibilityCriteria: scheme.eligibilityCriteria?.criteria || scheme.eligibilityCriteria || [],
            totalBudget: scheme.budget?.allocated || scheme.totalBudget || 0,
            disbursed: scheme.budget?.utilized || scheme.disbursed || 0,
            beneficiariesCount: scheme.beneficiariesCount || 0,
            status: scheme.status || 'active',
            startDate: scheme.startDate || new Date().toISOString(),
            endDate: scheme.endDate || new Date().toISOString(),
            ministry: scheme.ministry || 'Government'
          }));
          setSchemes(mappedSchemes);
        } else {
          // No schemes found, show empty state
          setSchemes([]);
        }
      } catch (err: any) {
        console.error('Failed to fetch welfare schemes:', err);
        setError(err.message || 'Failed to load welfare schemes');
        setSchemes([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSchemes();
  }, []);

  const categories = ['all', ...new Set(schemes.map(s => s.category))];
  const categoryOptions = categories.map(c => ({
    value: c,
    label: c === 'all' ? 'All Categories' : c,
  }));

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'expired', label: 'Expired' },
  ];

  const filteredSchemes = schemes.filter(scheme => {
    const matchesSearch = 
      scheme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scheme.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || scheme.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || scheme.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (status: WelfareScheme['status']) => {
    const config = {
      active: { variant: 'success' as const, icon: CheckCircle2 },
      paused: { variant: 'warning' as const, icon: Clock },
      upcoming: { variant: 'primary' as const, icon: Calendar },
      expired: { variant: 'error' as const, icon: XCircle },
    };
    return config[status];
  };

  const getBenefitTypeBadge = (type: WelfareScheme['benefitType']) => {
    const labels = {
      cash: 'Cash Transfer',
      subsidy: 'Subsidy',
      service: 'Service',
      insurance: 'Insurance',
    };
    return labels[type];
  };

  const stats = {
    totalSchemes: schemes.length,
    activeSchemes: schemes.filter(s => s.status === 'active').length,
    totalBeneficiaries: schemes.reduce((sum, s) => sum + s.beneficiariesCount, 0),
    totalDisbursed: schemes.reduce((sum, s) => sum + s.disbursed, 0),
  };

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
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welfare Schemes</h1>
          <p className="text-gray-500 mt-1">Manage government welfare programs and benefits</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add New Scheme
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Schemes"
          value={stats.totalSchemes.toString()}
          icon={<Heart className="h-5 w-5" />}
        />
        <StatCard
          title="Active Schemes"
          value={stats.activeSchemes.toString()}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Total Beneficiaries"
          value={formatNumber(stats.totalBeneficiaries)}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Total Disbursed"
          value={formatCurrency(stats.totalDisbursed)}
          icon={<IndianRupee className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search schemes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={categoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              className="w-40"
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

      {/* Schemes Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchemes.map((scheme) => {
          const status = getStatusBadge(scheme.status);
          const StatusIcon = status.icon;
          const utilizationRate = (scheme.disbursed / scheme.totalBudget) * 100;

          return (
            <Card key={scheme.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant="primary">{scheme.category}</Badge>
                  <Badge variant={status.variant}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {scheme.status}
                  </Badge>
                </div>

                <h3 className="font-semibold text-gray-900 mb-2">{scheme.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{scheme.description}</p>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Benefit</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(scheme.benefitAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Beneficiaries</span>
                    <span className="font-medium">{formatNumber(scheme.beneficiariesCount)}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Budget Utilized</span>
                      <span className="font-medium">{utilizationRate.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          utilizationRate > 90 ? 'bg-red-500' :
                          utilizationRate > 70 ? 'bg-amber-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${utilizationRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedScheme(scheme)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Details
                  </Button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Scheme Detail Modal */}
      <Modal
        isOpen={!!selectedScheme}
        onClose={() => setSelectedScheme(null)}
        title="Scheme Details"
        size="lg"
      >
        {selectedScheme && (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="primary">{selectedScheme.category}</Badge>
                <Badge variant={getStatusBadge(selectedScheme.status).variant}>
                  {selectedScheme.status}
                </Badge>
                <Badge variant="default">{getBenefitTypeBadge(selectedScheme.benefitType)}</Badge>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">{selectedScheme.name}</h3>
              <p className="text-gray-500 mt-1">{selectedScheme.description}</p>
            </div>

            {/* Key Details */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600 mb-1">Benefit Amount</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatCurrency(selectedScheme.benefitAmount)}
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 mb-1">Total Beneficiaries</p>
                <p className="text-2xl font-bold text-blue-700">
                  {formatNumber(selectedScheme.beneficiariesCount)}
                </p>
              </div>
            </div>

            {/* Budget */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Budget Allocation</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Budget</span>
                  <span className="font-medium">{formatCurrency(selectedScheme.totalBudget)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Disbursed</span>
                  <span className="font-medium text-green-600">{formatCurrency(selectedScheme.disbursed)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remaining</span>
                  <span className="font-medium">{formatCurrency(selectedScheme.totalBudget - selectedScheme.disbursed)}</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${(selectedScheme.disbursed / selectedScheme.totalBudget) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Eligibility Criteria */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Eligibility Criteria</h4>
              <ul className="space-y-2">
                {selectedScheme.eligibilityCriteria.map((criteria, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {criteria}
                  </li>
                ))}
              </ul>
            </div>

            {/* Period */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Start: {formatDate(selectedScheme.startDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>End: {formatDate(selectedScheme.endDate)}</span>
              </div>
            </div>

            {/* Ministry */}
            <div className="pt-4 border-t text-sm text-gray-500">
              Administered by: <span className="font-medium text-gray-700">{selectedScheme.ministry}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Scheme Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Welfare Scheme"
        size="lg"
      >
        <div className="space-y-4">
          <Input label="Scheme Name" placeholder="Enter scheme name" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              placeholder="Enter scheme description"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Select
              label="Category"
              options={categoryOptions.filter(c => c.value !== 'all')}
            />
            <Select
              label="Benefit Type"
              options={[
                { value: 'cash', label: 'Cash Transfer' },
                { value: 'subsidy', label: 'Subsidy' },
                { value: 'service', label: 'Service' },
                { value: 'insurance', label: 'Insurance' },
              ]}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Benefit Amount (₹)" type="number" placeholder="Enter amount" />
            <Input label="Total Budget (₹)" type="number" placeholder="Enter budget" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Start Date" type="date" />
            <Input label="End Date" type="date" />
          </div>
          <Input label="Ministry" placeholder="Enter administering ministry" />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Create Scheme
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WelfareSchemes;
