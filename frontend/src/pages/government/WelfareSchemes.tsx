import React, { useState, useEffect, useCallback } from 'react';
import { 
  Heart, 
  Users,
  IndianRupee,
  Calendar,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Save,
  X
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
  StatCard,
  Alert
} from '@/components/common';
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters';
import api from '@/services/api';

// ============================================================================
// Types
// ============================================================================

interface WelfareSchemeData {
  _id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  eligibilityCriteria: {
    incomeCategory: 'BPL' | 'APL' | 'both';
    maxAnnualIncome?: number;
    minAge?: number;
    maxAge?: number;
    gender: string;
    occupations: string[];
    states: string[];
  };
  benefits: {
    type: string;
    amount: number;
    frequency: string;
    description: string;
  };
  totalBudget: number;
  allocatedBudget: number;
  disbursedAmount: number;
  maxBeneficiaries?: number;
  currentBeneficiaries: number;
  startDate: string;
  endDate?: string;
  enrollmentStartDate?: string;
  enrollmentEndDate?: string;
  status: 'draft' | 'active' | 'suspended' | 'closed';
  requiredDocuments: { name: string; description: string; mandatory: boolean }[];
  ministry?: string;
  department?: string;
  implementingAgency?: string;
  helplineNumber?: string;
  email?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
}

interface SchemeFormData {
  name: string;
  code: string;
  description: string;
  category: string;
  incomeCategory: string;
  maxAnnualIncome: string;
  minAge: string;
  maxAge: string;
  gender: string;
  benefitType: string;
  benefitAmount: string;
  benefitFrequency: string;
  benefitDescription: string;
  totalBudget: string;
  maxBeneficiaries: string;
  startDate: string;
  endDate: string;
  status: string;
  ministry: string;
  department: string;
}

const EMPTY_FORM: SchemeFormData = {
  name: '',
  code: '',
  description: '',
  category: 'food',
  incomeCategory: 'BPL',
  maxAnnualIncome: '',
  minAge: '',
  maxAge: '',
  gender: 'all',
  benefitType: 'cash',
  benefitAmount: '',
  benefitFrequency: 'monthly',
  benefitDescription: '',
  totalBudget: '',
  maxBeneficiaries: '',
  startDate: '',
  endDate: '',
  status: 'draft',
  ministry: '',
  department: '',
};

// ============================================================================
// Constants
// ============================================================================

const categoryOptions = [
  { value: 'food', label: 'Food & Nutrition' },
  { value: 'housing', label: 'Housing' },
  { value: 'education', label: 'Education' },
  { value: 'health', label: 'Healthcare' },
  { value: 'employment', label: 'Employment' },
  { value: 'pension', label: 'Pension' },
  { value: 'skill', label: 'Skill Development' },
  { value: 'other', label: 'Other' },
];

const incomeCategoryOptions = [
  { value: 'BPL', label: 'BPL (Below Poverty Line)' },
  { value: 'APL', label: 'APL (Above Poverty Line)' },
  { value: 'both', label: 'Both APL & BPL' },
];

const benefitTypeOptions = [
  { value: 'cash', label: 'Cash Transfer' },
  { value: 'kind', label: 'In Kind' },
  { value: 'service', label: 'Service' },
  { value: 'subsidy', label: 'Subsidy' },
  { value: 'mixed', label: 'Mixed' },
];

const frequencyOptions = [
  { value: 'one_time', label: 'One Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'closed', label: 'Closed' },
];

const genderOptions = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const filterCategoryOptions = [
  { value: 'all', label: 'All Categories' },
  ...categoryOptions,
];

const filterStatusOptions = [
  { value: 'all', label: 'All Statuses' },
  ...statusOptions,
];

// ============================================================================
// Component
// ============================================================================

const WelfareSchemes: React.FC = () => {
  const [schemes, setSchemes] = useState<WelfareSchemeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [selectedScheme, setSelectedScheme] = useState<WelfareSchemeData | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [schemeToDelete, setSchemeToDelete] = useState<WelfareSchemeData | null>(null);
  const [editingScheme, setEditingScheme] = useState<WelfareSchemeData | null>(null);

  // Form state
  const [formData, setFormData] = useState<SchemeFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ============================================================================
  // Data fetching
  // ============================================================================

  const fetchSchemes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response: any = await api.get('/government/welfare-schemes');
      if (response.success && response.data) {
        setSchemes(response.data);
      } else {
        setSchemes([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch welfare schemes:', err);
      setError(err.message || 'Failed to load welfare schemes');
      setSchemes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchemes();
  }, [fetchSchemes]);

  // ============================================================================
  // Form helpers
  // ============================================================================

  const openAddModal = () => {
    setEditingScheme(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (scheme: WelfareSchemeData) => {
    setEditingScheme(scheme);
    setFormData({
      name: scheme.name,
      code: scheme.code,
      description: scheme.description,
      category: scheme.category,
      incomeCategory: scheme.eligibilityCriteria?.incomeCategory || 'BPL',
      maxAnnualIncome: scheme.eligibilityCriteria?.maxAnnualIncome?.toString() || '',
      minAge: scheme.eligibilityCriteria?.minAge?.toString() || '',
      maxAge: scheme.eligibilityCriteria?.maxAge?.toString() || '',
      gender: scheme.eligibilityCriteria?.gender || 'all',
      benefitType: scheme.benefits?.type || 'cash',
      benefitAmount: scheme.benefits?.amount?.toString() || '',
      benefitFrequency: scheme.benefits?.frequency || 'monthly',
      benefitDescription: scheme.benefits?.description || '',
      totalBudget: scheme.totalBudget?.toString() || '',
      maxBeneficiaries: scheme.maxBeneficiaries?.toString() || '',
      startDate: scheme.startDate ? scheme.startDate.split('T')[0] : '',
      endDate: scheme.endDate ? scheme.endDate.split('T')[0] : '',
      status: scheme.status,
      ministry: scheme.ministry || '',
      department: scheme.department || '',
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const updateFormField = (field: keyof SchemeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ============================================================================
  // CRUD operations
  // ============================================================================

  const handleSave = async () => {
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Scheme name is required');
      return;
    }
    if (!formData.code.trim()) {
      setFormError('Scheme code is required');
      return;
    }
    if (!formData.description.trim()) {
      setFormError('Description is required');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim(),
        description: formData.description.trim(),
        category: formData.category,
        eligibilityCriteria: {
          incomeCategory: formData.incomeCategory,
          maxAnnualIncome: formData.maxAnnualIncome ? Number(formData.maxAnnualIncome) : undefined,
          minAge: formData.minAge ? Number(formData.minAge) : undefined,
          maxAge: formData.maxAge ? Number(formData.maxAge) : undefined,
          gender: formData.gender,
        },
        benefits: {
          type: formData.benefitType,
          amount: formData.benefitAmount ? Number(formData.benefitAmount) : 0,
          frequency: formData.benefitFrequency,
          description: formData.benefitDescription,
        },
        totalBudget: formData.totalBudget ? Number(formData.totalBudget) : 0,
        maxBeneficiaries: formData.maxBeneficiaries ? Number(formData.maxBeneficiaries) : undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        status: formData.status,
        ministry: formData.ministry || undefined,
        department: formData.department || undefined,
      };

      if (editingScheme) {
        await api.put(`/government/welfare-schemes/${editingScheme._id}`, payload);
        setSuccessMessage(`Scheme "${formData.name}" updated successfully`);
      } else {
        await api.post('/government/welfare-schemes', payload);
        setSuccessMessage(`Scheme "${formData.name}" created successfully`);
      }

      setIsFormModalOpen(false);
      setEditingScheme(null);
      setFormData(EMPTY_FORM);
      await fetchSchemes();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save scheme');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (scheme: WelfareSchemeData) => {
    setSchemeToDelete(scheme);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async (hardDelete = false) => {
    if (!schemeToDelete) return;

    setIsDeleting(true);
    try {
      await api.delete(`/government/welfare-schemes/${schemeToDelete._id}`, {
        data: { hardDelete }
      } as any);
      setSuccessMessage(`Scheme "${schemeToDelete.name}" ${hardDelete ? 'deleted permanently' : 'closed'} successfully`);
      setIsDeleteModalOpen(false);
      setSchemeToDelete(null);
      if (selectedScheme?._id === schemeToDelete._id) {
        setSelectedScheme(null);
      }
      await fetchSchemes();
    } catch (err: any) {
      setFormError(err.message || 'Failed to delete scheme');
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================================================
  // Filtering
  // ============================================================================

  const filteredSchemes = schemes.filter(scheme => {
    const matchesSearch =
      scheme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scheme.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scheme.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || scheme.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || scheme.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // ============================================================================
  // UI Helpers
  // ============================================================================

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { variant: 'success' | 'warning' | 'primary' | 'error'; icon: typeof CheckCircle2 }> = {
      active: { variant: 'success', icon: CheckCircle2 },
      draft: { variant: 'warning', icon: Clock },
      suspended: { variant: 'error', icon: XCircle },
      closed: { variant: 'error', icon: XCircle },
    };
    return configs[status] || configs.draft;
  };

  const getIncomeBadge = (incomeCategory: string) => {
    switch (incomeCategory) {
      case 'BPL': return <Badge variant="warning">BPL Only</Badge>;
      case 'APL': return <Badge variant="success">APL Only</Badge>;
      case 'both': return <Badge variant="primary">All Income Groups</Badge>;
      default: return <Badge variant="default">{incomeCategory}</Badge>;
    }
  };

  const stats = {
    totalSchemes: schemes.length,
    activeSchemes: schemes.filter(s => s.status === 'active').length,
    totalBeneficiaries: schemes.reduce((sum, s) => sum + (s.currentBeneficiaries || 0), 0),
    totalDisbursed: schemes.reduce((sum, s) => sum + (s.disbursedAmount || 0), 0),
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {successMessage && (
        <Alert variant="success" onClose={() => setSuccessMessage(null)}>
          <CheckCircle2 className="h-4 w-4" />
          <span>{successMessage}</span>
        </Alert>
      )}
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welfare Schemes</h1>
          <p className="text-gray-500 mt-1">Create, manage, and track government welfare programs</p>
        </div>
        <Button onClick={openAddModal}>
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
                placeholder="Search schemes by name, code, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={filterCategoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              className="w-48"
            />
            <Select
              options={filterStatusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {filteredSchemes.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No welfare schemes found</h3>
            <p className="text-gray-500 mb-6">
              {schemes.length === 0
                ? 'Get started by creating your first welfare scheme.'
                : 'No schemes match your current filters.'}
            </p>
            {schemes.length === 0 && (
              <Button onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Scheme
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Schemes Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchemes.map((scheme) => {
          const statusConfig = getStatusConfig(scheme.status);
          const StatusIcon = statusConfig.icon;
          const budget = scheme.totalBudget || 1;
          const utilizationRate = ((scheme.disbursedAmount || 0) / budget) * 100;

          return (
            <Card key={scheme._id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                {/* Top badges */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="primary">{scheme.category}</Badge>
                    {getIncomeBadge(scheme.eligibilityCriteria?.incomeCategory || 'both')}
                  </div>
                  <Badge variant={statusConfig.variant}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {scheme.status}
                  </Badge>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1">{scheme.name}</h3>
                <p className="text-xs text-gray-400 mb-2">Code: {scheme.code}</p>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{scheme.description}</p>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Benefit</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(scheme.benefits?.amount || 0)}
                      <span className="text-xs text-gray-400 ml-1">
                        /{scheme.benefits?.frequency || 'monthly'}
                      </span>
                    </span>
                  </div>
                  {scheme.eligibilityCriteria?.maxAnnualIncome && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Max Income</span>
                      <span className="font-medium">
                        {formatCurrency(scheme.eligibilityCriteria.maxAnnualIncome)}/yr
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Beneficiaries</span>
                    <span className="font-medium">
                      {formatNumber(scheme.currentBeneficiaries || 0)}
                      {scheme.maxBeneficiaries ? ` / ${formatNumber(scheme.maxBeneficiaries)}` : ''}
                    </span>
                  </div>
                  {scheme.totalBudget > 0 && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Budget Used</span>
                        <span className="font-medium">{Math.min(utilizationRate, 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            utilizationRate > 90 ? 'bg-red-500' :
                            utilizationRate > 70 ? 'bg-amber-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-between pt-3 border-t">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedScheme(scheme)}>
                    <Eye className="h-4 w-4 mr-1" />
                    Details
                  </Button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(scheme)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => confirmDelete(scheme)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* Detail Modal */}
      {/* ================================================================== */}
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
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Badge variant="primary">{selectedScheme.category}</Badge>
                <Badge variant={getStatusConfig(selectedScheme.status).variant}>
                  {selectedScheme.status}
                </Badge>
                {getIncomeBadge(selectedScheme.eligibilityCriteria?.incomeCategory || 'both')}
              </div>
              <h3 className="text-xl font-semibold text-gray-900">{selectedScheme.name}</h3>
              <p className="text-sm text-gray-400">Code: {selectedScheme.code}</p>
              <p className="text-gray-500 mt-2">{selectedScheme.description}</p>
            </div>

            {/* Eligibility Criteria */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-3">Eligibility Criteria</h4>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-600">Target Group:</span>{' '}
                  <span className="font-medium text-blue-900">
                    {selectedScheme.eligibilityCriteria?.incomeCategory === 'both'
                      ? 'All (APL & BPL)'
                      : selectedScheme.eligibilityCriteria?.incomeCategory}
                  </span>
                </div>
                {selectedScheme.eligibilityCriteria?.maxAnnualIncome && (
                  <div>
                    <span className="text-blue-600">Max Annual Income:</span>{' '}
                    <span className="font-medium text-blue-900">
                      {formatCurrency(selectedScheme.eligibilityCriteria.maxAnnualIncome)}
                    </span>
                  </div>
                )}
                {selectedScheme.eligibilityCriteria?.minAge && (
                  <div>
                    <span className="text-blue-600">Min Age:</span>{' '}
                    <span className="font-medium text-blue-900">{selectedScheme.eligibilityCriteria.minAge} years</span>
                  </div>
                )}
                {selectedScheme.eligibilityCriteria?.maxAge && (
                  <div>
                    <span className="text-blue-600">Max Age:</span>{' '}
                    <span className="font-medium text-blue-900">{selectedScheme.eligibilityCriteria.maxAge} years</span>
                  </div>
                )}
                <div>
                  <span className="text-blue-600">Gender:</span>{' '}
                  <span className="font-medium text-blue-900 capitalize">{selectedScheme.eligibilityCriteria?.gender || 'All'}</span>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600 mb-1">Benefit Amount</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatCurrency(selectedScheme.benefits?.amount || 0)}
                </p>
                <p className="text-xs text-green-500 mt-1 capitalize">
                  {selectedScheme.benefits?.type} / {selectedScheme.benefits?.frequency}
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 mb-1">Total Beneficiaries</p>
                <p className="text-2xl font-bold text-blue-700">
                  {formatNumber(selectedScheme.currentBeneficiaries || 0)}
                </p>
                {selectedScheme.maxBeneficiaries && (
                  <p className="text-xs text-blue-500 mt-1">
                    Max: {formatNumber(selectedScheme.maxBeneficiaries)}
                  </p>
                )}
              </div>
            </div>

            {/* Budget */}
            {selectedScheme.totalBudget > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Budget Allocation</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Budget</span>
                    <span className="font-medium">{formatCurrency(selectedScheme.totalBudget)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Disbursed</span>
                    <span className="font-medium text-green-600">{formatCurrency(selectedScheme.disbursedAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Remaining</span>
                    <span className="font-medium">
                      {formatCurrency(selectedScheme.totalBudget - (selectedScheme.disbursedAmount || 0))}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{
                        width: `${Math.min(((selectedScheme.disbursedAmount || 0) / selectedScheme.totalBudget) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Period */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Start: {selectedScheme.startDate ? formatDate(selectedScheme.startDate) : 'N/A'}</span>
              </div>
              {selectedScheme.endDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>End: {formatDate(selectedScheme.endDate)}</span>
                </div>
              )}
            </div>

            {/* Ministry */}
            {(selectedScheme.ministry || selectedScheme.department) && (
              <div className="pt-4 border-t text-sm text-gray-500">
                {selectedScheme.ministry && (
                  <p>Ministry: <span className="font-medium text-gray-700">{selectedScheme.ministry}</span></p>
                )}
                {selectedScheme.department && (
                  <p>Department: <span className="font-medium text-gray-700">{selectedScheme.department}</span></p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                const s = selectedScheme;
                setSelectedScheme(null);
                openEditModal(s);
              }}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Scheme
              </Button>
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => {
                const s = selectedScheme;
                setSelectedScheme(null);
                confirmDelete(s);
              }}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================== */}
      {/* Create/Edit Modal */}
      {/* ================================================================== */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingScheme(null); }}
        title={editingScheme ? 'Edit Welfare Scheme' : 'Create New Welfare Scheme'}
        size="xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {formError && (
            <Alert variant="error" onClose={() => setFormError(null)}>
              <AlertTriangle className="h-4 w-4" />
              <span>{formError}</span>
            </Alert>
          )}

          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Basic Information</h4>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Scheme Name *"
                  placeholder="e.g., PM-KISAN Yojana"
                  value={formData.name}
                  onChange={(e) => updateFormField('name', e.target.value)}
                />
                <Input
                  label="Scheme Code *"
                  placeholder="e.g., PMKISAN"
                  value={formData.code}
                  onChange={(e) => updateFormField('code', e.target.value.toUpperCase())}
                  disabled={!!editingScheme}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  rows={3}
                  placeholder="Describe the welfare scheme and its objectives..."
                  value={formData.description}
                  onChange={(e) => updateFormField('description', e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Select
                  label="Category"
                  options={categoryOptions}
                  value={formData.category}
                  onChange={(val) => updateFormField('category', val)}
                />
                <Select
                  label="Status"
                  options={statusOptions}
                  value={formData.status}
                  onChange={(val) => updateFormField('status', val)}
                />
              </div>
            </div>
          </div>

          {/* Eligibility Criteria */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Eligibility & Targeting
            </h4>
            <div className="p-4 bg-blue-50 rounded-lg space-y-4">
              <Select
                label="Target Income Group"
                options={incomeCategoryOptions}
                value={formData.incomeCategory}
                onChange={(val) => updateFormField('incomeCategory', val)}
              />
              <Input
                label="Max Annual Income (₹)"
                type="number"
                placeholder="e.g., 100000 (leave empty for no limit)"
                value={formData.maxAnnualIncome}
                onChange={(e) => updateFormField('maxAnnualIncome', e.target.value)}
              />
              <div className="grid md:grid-cols-3 gap-4">
                <Input
                  label="Min Age"
                  type="number"
                  placeholder="e.g., 18"
                  value={formData.minAge}
                  onChange={(e) => updateFormField('minAge', e.target.value)}
                />
                <Input
                  label="Max Age"
                  type="number"
                  placeholder="e.g., 65"
                  value={formData.maxAge}
                  onChange={(e) => updateFormField('maxAge', e.target.value)}
                />
                <Select
                  label="Gender"
                  options={genderOptions}
                  value={formData.gender}
                  onChange={(val) => updateFormField('gender', val)}
                />
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Benefits</h4>
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Select
                  label="Benefit Type"
                  options={benefitTypeOptions}
                  value={formData.benefitType}
                  onChange={(val) => updateFormField('benefitType', val)}
                />
                <Input
                  label="Benefit Amount (₹)"
                  type="number"
                  placeholder="e.g., 6000"
                  value={formData.benefitAmount}
                  onChange={(e) => updateFormField('benefitAmount', e.target.value)}
                />
                <Select
                  label="Frequency"
                  options={frequencyOptions}
                  value={formData.benefitFrequency}
                  onChange={(val) => updateFormField('benefitFrequency', val)}
                />
              </div>
              <Input
                label="Benefit Description"
                placeholder="e.g., Direct cash transfer to farmer bank accounts"
                value={formData.benefitDescription}
                onChange={(e) => updateFormField('benefitDescription', e.target.value)}
              />
            </div>
          </div>

          {/* Budget & Capacity */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Budget & Capacity</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Total Budget (₹)"
                type="number"
                placeholder="e.g., 100000000"
                value={formData.totalBudget}
                onChange={(e) => updateFormField('totalBudget', e.target.value)}
              />
              <Input
                label="Max Beneficiaries"
                type="number"
                placeholder="Leave empty for unlimited"
                value={formData.maxBeneficiaries}
                onChange={(e) => updateFormField('maxBeneficiaries', e.target.value)}
              />
            </div>
          </div>

          {/* Dates */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Timeline</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={formData.startDate}
                onChange={(e) => updateFormField('startDate', e.target.value)}
              />
              <Input
                label="End Date"
                type="date"
                value={formData.endDate}
                onChange={(e) => updateFormField('endDate', e.target.value)}
              />
            </div>
          </div>

          {/* Administrative */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Administration</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Ministry"
                placeholder="e.g., Ministry of Agriculture"
                value={formData.ministry}
                onChange={(e) => updateFormField('ministry', e.target.value)}
              />
              <Input
                label="Department"
                placeholder="e.g., Department of Rural Development"
                value={formData.department}
                onChange={(e) => updateFormField('department', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-6 mt-4 border-t">
          <Button variant="outline" onClick={() => { setIsFormModalOpen(false); setEditingScheme(null); }} disabled={isSaving}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {editingScheme ? 'Update Scheme' : 'Create Scheme'}
              </>
            )}
          </Button>
        </div>
      </Modal>

      {/* ================================================================== */}
      {/* Delete Confirmation Modal */}
      {/* ================================================================== */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setSchemeToDelete(null); }}
        title="Delete Welfare Scheme"
        size="sm"
      >
        {schemeToDelete && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{schemeToDelete.name}</strong> ({schemeToDelete.code})?
            </p>
            {schemeToDelete.currentBeneficiaries > 0 && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  This scheme has {formatNumber(schemeToDelete.currentBeneficiaries)} active beneficiaries.
                  Closing will prevent new enrollments.
                </span>
              </Alert>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => { setIsDeleteModalOpen(false); setSchemeToDelete(null); }} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => handleDelete(true)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WelfareSchemes;
