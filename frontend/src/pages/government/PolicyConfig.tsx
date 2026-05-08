import React, { useState, useEffect, useCallback } from 'react';
import { 
  Save,
  AlertCircle,
  Info,
  Edit2,
  Plus,
  Trash2,
  PlayCircle,
  RefreshCw,
  Check,
  X,
  Clock,
  Shield
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardDescription,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  Modal,
  Alert,
  Tabs
} from '@/components/common';
import { formatDate } from '@/utils/formatters';
import { toast } from 'react-hot-toast';
import api from '@/services/api';

// Types
interface PolicyRule {
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface ClassificationPolicy {
  _id: string;
  policyId: string;
  name: string;
  description: string;
  policyType: 'exclusion_override' | 'inclusion_override' | 'threshold_override';
  rules: PolicyRule[];
  ruleLogic: 'AND' | 'OR';
  action: 'reclassify_to_bpl' | 'reclassify_to_apl' | 'flag_for_review' | 'ignore_criterion';
  targetCriteria: string[];
  priority: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy?: { name: string; designation: string };
  lastModifiedBy?: { name: string; designation: string };
  createdAt: string;
  updatedAt: string;
}

interface PolicyField {
  field: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  options?: string[];
  category: string;
}

interface PolicyApplicationStatus {
  policiesModifiedSinceLastApply: boolean;
  lastPolicyModification: string | null;
  lastPolicyApplication: {
    timestamp: string;
    triggeredBy: string;
    totalFamilies: number;
    reclassified: number;
    unchanged: number;
    errors: number;
  } | null;
}

const PolicyConfiguration: React.FC = () => {
  // State
  const [policies, setPolicies] = useState<ClassificationPolicy[]>([]);
  const [fields, setFields] = useState<PolicyField[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [policyTypes, setPolicyTypes] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [targetCriteriaOptions, setTargetCriteriaOptions] = useState<string[]>([]);
  const [applicationStatus, setApplicationStatus] = useState<PolicyApplicationStatus | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [activeTab, setActiveTab] = useState('policies');
  const [policyTypeFilter, setPolicyTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [isHardDelete, setIsHardDelete] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<ClassificationPolicy | null>(null);
  const [applyResult, setApplyResult] = useState<any>(null);
  
  // Form state for create/edit
  const [formData, setFormData] = useState({
    policyId: '',
    name: '',
    description: '',
    policyType: 'exclusion_override',
    rules: [{ field: '', operator: 'equals', value: '' }] as PolicyRule[],
    ruleLogic: 'AND' as 'AND' | 'OR',
    action: 'reclassify_to_bpl',
    targetCriteria: [] as string[],
    priority: 0,
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveUntil: ''
  });
  const [formReason, setFormReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch policies and field options
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [policiesRes, fieldsRes, statusRes] = await Promise.all([
        api.get('/government/classification-policies'),
        api.get('/government/classification-policies/fields'),
        api.get('/government/classification-policies/status')
      ]) as any[];
      
      // API returns { success, data, message } - axios interceptor returns response.data
      // So policiesRes = { success: true, data: {...} }
      setPolicies(policiesRes.data?.policies || []);
      setApplicationStatus(policiesRes.data?.applicationStatus || statusRes.data);
      
      const fieldsData = fieldsRes.data || {};
      setFields(fieldsData.fields || []);
      setOperators(fieldsData.operators || []);
      setPolicyTypes(fieldsData.policyTypes || []);
      setActions(fieldsData.actions || []);
      setTargetCriteriaOptions(fieldsData.targetCriteriaOptions || []);
      
    } catch (error: any) {
      console.error('Error fetching policies:', error);
      toast.error('Failed to load policies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset form for new policy
  const resetForm = () => {
    setFormData({
      policyId: '',
      name: '',
      description: '',
      policyType: 'exclusion_override',
      rules: [{ field: '', operator: 'equals', value: '' }],
      ruleLogic: 'AND',
      action: 'reclassify_to_bpl',
      targetCriteria: [],
      priority: 0,
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveUntil: ''
    });
    setFormReason('');
  };

  // Open edit modal with policy data
  const handleEditPolicy = (policy: ClassificationPolicy) => {
    setSelectedPolicy(policy);
    setFormData({
      policyId: policy.policyId,
      name: policy.name,
      description: policy.description || '',
      policyType: policy.policyType,
      rules: policy.rules.length > 0 ? policy.rules : [{ field: '', operator: 'equals', value: '' }],
      ruleLogic: policy.ruleLogic,
      action: policy.action,
      targetCriteria: policy.targetCriteria || [],
      priority: policy.priority,
      effectiveFrom: policy.effectiveFrom?.split('T')[0] || '',
      effectiveUntil: policy.effectiveUntil?.split('T')[0] || ''
    });
    setFormReason('');
    setShowEditModal(true);
  };

  // Create new policy
  const handleCreatePolicy = async () => {
    if (!formData.policyId || !formData.name || formData.rules.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate rules
    const invalidRules = formData.rules.filter(r => !r.field || !r.operator);
    if (invalidRules.length > 0) {
      toast.error('Please complete all rule definitions');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/government/classification-policies', {
        ...formData,
        effectiveFrom: formData.effectiveFrom ? new Date(formData.effectiveFrom).toISOString() : undefined,
        effectiveUntil: formData.effectiveUntil ? new Date(formData.effectiveUntil).toISOString() : undefined
      });
      
      toast.success('Policy created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update existing policy
  const handleUpdatePolicy = async () => {
    if (!selectedPolicy || !formReason.trim()) {
      toast.error('Please provide a reason for the change');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.put(`/government/classification-policies/${selectedPolicy.policyId}`, {
        ...formData,
        reason: formReason,
        effectiveFrom: formData.effectiveFrom ? new Date(formData.effectiveFrom).toISOString() : undefined,
        effectiveUntil: formData.effectiveUntil ? new Date(formData.effectiveUntil).toISOString() : undefined
      });
      
      toast.success('Policy updated successfully');
      setShowEditModal(false);
      setSelectedPolicy(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete (deactivate) policy
  const handleDeletePolicy = async () => {
    if (!selectedPolicy) return;

    setIsSubmitting(true);
    try {
      await api.delete(`/government/classification-policies/${selectedPolicy.policyId}`, {
        data: { reason: formReason || 'Policy deleted', hardDelete: isHardDelete }
      });
      
      toast.success(isHardDelete ? 'Policy deleted permanently' : 'Policy deactivated successfully');
      setShowDeleteModal(false);
      setSelectedPolicy(null);
      setFormReason('');
      setIsHardDelete(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Apply all policies to existing families
  const handleApplyPolicies = async () => {
    setIsApplying(true);
    setApplyResult(null);
    
    try {
      const response = await api.post('/government/classification-policies/apply') as any;
      setApplyResult(response.data);
      toast.success(`Policy application completed: ${response.data?.reclassified || 0} families reclassified`);
      fetchData(); // Refresh to update status
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply policies');
      setApplyResult({ error: error.response?.data?.message || 'Failed to apply policies' });
    } finally {
      setIsApplying(false);
    }
  };

  // Add a new rule to form
  const addRule = () => {
    setFormData(prev => ({
      ...prev,
      rules: [...prev.rules, { field: '', operator: 'equals', value: '' }]
    }));
  };

  // Remove a rule from form
  const removeRule = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index)
    }));
  };

  // Update a specific rule
  const updateRule = (index: number, updates: Partial<PolicyRule>) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, i) => i === index ? { ...rule, ...updates } : rule)
    }));
  };

  // Get operators applicable to a field type
  const getOperatorsForField = (fieldName: string) => {
    const field = fields.find(f => f.field === fieldName);
    if (!field) return operators;
    
    return operators.filter(op => op.applicableTo.includes(field.type));
  };

  // Filter policies
  const filteredPolicies = policies.filter(p => {
    if (policyTypeFilter !== 'all' && p.policyType !== policyTypeFilter) return false;
    if (statusFilter === 'active' && !p.isActive) return false;
    if (statusFilter === 'inactive' && p.isActive) return false;
    return true;
  });

  // Get action label
  const getActionLabel = (action: string) => {
    const actionObj = actions.find(a => a.value === action);
    return actionObj?.label || action;
  };

  // Get policy type label
  const getPolicyTypeLabel = (type: string) => {
    const typeObj = policyTypes.find(t => t.value === type);
    return typeObj?.label || type;
  };

  const tabs = [
    { id: 'policies', label: 'Classification Policies' },
    { id: 'apply', label: 'Apply Policies' }
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
          <h1 className="text-2xl font-bold text-gray-900">Policy Configuration</h1>
          <p className="text-gray-500 mt-1">Manage APL/BPL classification override policies</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => { resetForm(); setShowCreateModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Policy
          </Button>
        </div>
      </div>

      {/* Policy Application Status Alert */}
      {applicationStatus?.policiesModifiedSinceLastApply && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <div className="flex-1">
            <span className="font-medium">Policies have been modified since last application.</span>
            <p className="text-sm mt-1">
              Click "Apply All Policies" to re-screen existing families with the updated policies.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowApplyModal(true)}>
            <PlayCircle className="h-4 w-4 mr-1" />
            Apply Now
          </Button>
        </Alert>
      )}

      {/* Info Alert */}
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <span>
          Classification policies override AI model decisions without retraining. 
          Create rules to ignore specific exclusion criteria (e.g., car ownership) or add custom classification logic.
        </span>
      </Alert>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 justify-end">
            <Select
              options={[
                { value: 'all', label: 'All Types' },
                ...policyTypes.map((t: any) => ({ value: t.value, label: t.label }))
              ]}
              value={policyTypeFilter}
              onChange={setPolicyTypeFilter}
              className="w-48"
            />
            <Select
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-36"
            />
          </div>

          {/* Policy Cards */}
          {filteredPolicies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Policies Found</h3>
                <p className="text-gray-500 mb-4">
                  Create your first classification override policy to customize APL/BPL decisions.
                </p>
                <Button variant="primary" onClick={() => { resetForm(); setShowCreateModal(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Policy
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredPolicies.map((policy) => (
                <Card key={policy._id} className={`hover:shadow-md transition-shadow ${!policy.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                          <Badge variant={policy.isActive ? 'success' : 'gray'}>
                            {policy.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="primary">
                            {getPolicyTypeLabel(policy.policyType)}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{policy.description}</p>
                        <p className="text-xs text-gray-400 mt-1">ID: {policy.policyId}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditPolicy(policy)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => { setSelectedPolicy(policy); setFormReason(''); setIsHardDelete(false); setShowDeleteModal(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Rules Display */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">
                        Rules ({policy.ruleLogic === 'AND' ? 'All must match' : 'Any must match'}):
                      </p>
                      <div className="space-y-1">
                        {policy.rules.map((rule, idx) => {
                          const fieldObj = fields.find(f => f.field === rule.field);
                          return (
                            <div key={idx} className="text-sm flex items-center gap-2">
                              <span className="font-medium text-gray-700">
                                {fieldObj?.label || rule.field}
                              </span>
                              <span className="text-gray-500">{rule.operator.replace(/_/g, ' ')}</span>
                              <span className="text-primary-600 font-medium">
                                {typeof rule.value === 'boolean' ? (rule.value ? 'Yes' : 'No') : String(rule.value)}
                              </span>
                              {idx < policy.rules.length - 1 && (
                                <span className="text-gray-400 text-xs">{policy.ruleLogic}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action and Meta */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-600">
                          Action: <span className="font-medium text-primary-600">{getActionLabel(policy.action)}</span>
                        </span>
                        {policy.targetCriteria && policy.targetCriteria.length > 0 && (
                          <span className="text-gray-500">
                            Targets: {policy.targetCriteria.slice(0, 2).join(', ')}
                            {policy.targetCriteria.length > 2 && ` +${policy.targetCriteria.length - 2} more`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Priority: {policy.priority}</span>
                        <span>Updated: {formatDate(policy.updatedAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Apply Policies Tab */}
      {activeTab === 'apply' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary-600" />
                Apply Classification Policies
              </CardTitle>
              <CardDescription>
                Re-screen all existing families against active classification policies. 
                This will reclassify families based on policy overrides without retraining the AI model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Info */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Last Policy Modification</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {applicationStatus?.lastPolicyModification 
                      ? formatDate(applicationStatus.lastPolicyModification)
                      : 'Never'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Last Application</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {applicationStatus?.lastPolicyApplication?.timestamp
                      ? formatDate(applicationStatus.lastPolicyApplication.timestamp)
                      : 'Never'}
                  </p>
                  {applicationStatus?.lastPolicyApplication && (
                    <p className="text-sm text-gray-500 mt-1">
                      {applicationStatus.lastPolicyApplication.reclassified} reclassified / 
                      {applicationStatus.lastPolicyApplication.totalFamilies} total
                    </p>
                  )}
                </div>
              </div>

              {/* Status Indicator */}
              {applicationStatus?.policiesModifiedSinceLastApply ? (
                <Alert variant="warning">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    Policies have been modified since last application. 
                    Run the application to update family classifications.
                  </span>
                </Alert>
              ) : (
                <Alert variant="success">
                  <Check className="h-4 w-4" />
                  <span>All policies are up to date. No pending changes to apply.</span>
                </Alert>
              )}

              {/* Active Policies Summary */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Active Policies ({policies.filter(p => p.isActive).length})</h4>
                <div className="flex flex-wrap gap-2">
                  {policies.filter(p => p.isActive).map(policy => (
                    <Badge key={policy._id} variant="primary">
                      {policy.name}
                    </Badge>
                  ))}
                  {policies.filter(p => p.isActive).length === 0 && (
                    <span className="text-sm text-gray-500">No active policies</span>
                  )}
                </div>
              </div>

              {/* Apply Button */}
              <div className="flex justify-center pt-4">
                <Button 
                  variant="primary" 
                  size="lg"
                  onClick={() => setShowApplyModal(true)}
                  disabled={policies.filter(p => p.isActive).length === 0}
                >
                  <PlayCircle className="h-5 w-5 mr-2" />
                  Apply All Policies to Existing Families
                </Button>
              </div>

              {/* Previous Result */}
              {applyResult && !applyResult.error && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-green-800 mb-3">Last Application Result</h4>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-700">{applyResult.totalFamilies}</p>
                        <p className="text-sm text-green-600">Total Families</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-700">{applyResult.reclassified}</p>
                        <p className="text-sm text-green-600">Reclassified</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-600">{applyResult.unchanged}</p>
                        <p className="text-sm text-gray-500">Unchanged</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{applyResult.errors}</p>
                        <p className="text-sm text-red-500">Errors</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Classification Policy"
        size="lg"
      >
        <PolicyForm
          formData={formData}
          setFormData={setFormData}
          fields={fields}
          operators={operators}
          policyTypes={policyTypes}
          actions={actions}
          targetCriteriaOptions={targetCriteriaOptions}
          getOperatorsForField={getOperatorsForField}
          addRule={addRule}
          removeRule={removeRule}
          updateRule={updateRule}
          isEdit={false}
        />
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
          <Button variant="outline" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreatePolicy}
            disabled={isSubmitting}
            isLoading={isSubmitting}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Policy
          </Button>
        </div>
      </Modal>

      {/* Edit Policy Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedPolicy(null); }}
        title="Edit Classification Policy"
        size="lg"
      >
        <PolicyForm
          formData={formData}
          setFormData={setFormData}
          fields={fields}
          operators={operators}
          policyTypes={policyTypes}
          actions={actions}
          targetCriteriaOptions={targetCriteriaOptions}
          getOperatorsForField={getOperatorsForField}
          addRule={addRule}
          removeRule={removeRule}
          updateRule={updateRule}
          isEdit={true}
        />
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for Change *
          </label>
          <textarea
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows={2}
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
            placeholder="Provide justification for this change"
          />
        </div>
        <Alert variant="warning" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <span>Changes to policies require re-applying to existing families to take effect.</span>
        </Alert>
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
          <Button variant="outline" onClick={() => { setShowEditModal(false); setSelectedPolicy(null); }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdatePolicy}
            disabled={!formReason.trim() || isSubmitting}
            isLoading={isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedPolicy(null); setIsHardDelete(false); }}
        title={isHardDelete ? 'Delete Policy' : 'Deactivate Policy'}
      >
        {selectedPolicy && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to {isHardDelete ? 'delete' : 'deactivate'} the policy <strong>{selectedPolicy.name}</strong>?
            </p>
            <p className={`text-sm ${isHardDelete ? 'text-red-600' : 'text-gray-500'}`}>
              {isHardDelete
                ? 'This will permanently delete the policy and cannot be undone.'
                : 'This policy will no longer be applied to new or existing classifications.'}
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={isHardDelete}
                onChange={(e) => setIsHardDelete(e.target.checked)}
              />
              <span>
                Permanently delete policy (cannot be undone)
                <span className="block text-xs text-gray-500">Use this only if you need to remove it completely.</span>
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                rows={2}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder={isHardDelete ? 'Reason for permanent deletion' : 'Reason for deactivation'}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => { setShowDeleteModal(false); setSelectedPolicy(null); setIsHardDelete(false); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeletePolicy}
                disabled={isSubmitting}
                isLoading={isSubmitting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isHardDelete ? 'Delete Permanently' : 'Deactivate Policy'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Apply Policies Confirmation Modal */}
      <Modal
        isOpen={showApplyModal}
        onClose={() => { setShowApplyModal(false); setApplyResult(null); }}
        title="Apply Classification Policies"
      >
        <div className="space-y-4">
          {!isApplying && !applyResult && (
            <>
              <Alert variant="info">
                <Info className="h-4 w-4" />
                <span>
                  This will re-screen all existing family records against the current active policies.
                  Families may be reclassified from APL to BPL or vice versa based on policy rules.
                </span>
              </Alert>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Active Policies to Apply ({policies.filter(p => p.isActive).length})
                </h4>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {policies.filter(p => p.isActive).map(policy => (
                    <li key={policy._id}>{policy.name}</li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowApplyModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleApplyPolicies}>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Apply Policies
                </Button>
              </div>
            </>
          )}

          {isApplying && (
            <div className="py-8 text-center">
              <Spinner size="lg" className="mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">Applying Policies...</p>
              <p className="text-sm text-gray-500 mt-2">
                Re-screening all families. This may take a few moments.
              </p>
            </div>
          )}

          {applyResult && !applyResult.error && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Policies Applied Successfully</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{applyResult.totalFamilies}</p>
                  <p className="text-sm text-gray-500">Total Families Processed</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{applyResult.reclassified}</p>
                  <p className="text-sm text-green-700">Families Reclassified</p>
                </div>
              </div>
              {applyResult.reclassificationDetails && applyResult.reclassificationDetails.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Reclassification Details</h4>
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Ration No</th>
                          <th className="px-3 py-2 text-left">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applyResult.reclassificationDetails.slice(0, 10).map((detail: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{detail.ration_no}</td>
                            <td className="px-3 py-2">
                              <span className="text-red-600">{detail.oldClassification}</span>
                              {' → '}
                              <span className="text-green-600">{detail.newClassification}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {applyResult.hasMoreDetails && (
                    <p className="text-xs text-gray-500 mt-1">
                      Showing first 10 of {applyResult.reclassificationDetails.length} reclassifications
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button variant="primary" onClick={() => { setShowApplyModal(false); setApplyResult(null); }}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {applyResult?.error && (
            <div className="space-y-4">
              <Alert variant="error">
                <X className="h-4 w-4" />
                <span>{applyResult.error}</span>
              </Alert>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => { setShowApplyModal(false); setApplyResult(null); }}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

// Policy Form Component
interface PolicyFormProps {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  fields: PolicyField[];
  operators: any[];
  policyTypes: any[];
  actions: any[];
  targetCriteriaOptions: string[];
  getOperatorsForField: (fieldName: string) => any[];
  addRule: () => void;
  removeRule: (index: number) => void;
  updateRule: (index: number, updates: Partial<PolicyRule>) => void;
  isEdit: boolean;
}

const PolicyForm: React.FC<PolicyFormProps> = ({
  formData,
  setFormData,
  fields,
  policyTypes,
  actions,
  targetCriteriaOptions,
  getOperatorsForField,
  addRule,
  removeRule,
  updateRule,
  isEdit
}) => {
  // Group fields by category
  const fieldsByCategory = fields.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, PolicyField[]>);

  return (
    <div className="space-y-4 pr-2">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Policy ID *"
          value={formData.policyId}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, policyId: e.target.value }))}
          placeholder="e.g., POL_IGNORE_CAR"
          disabled={isEdit}
        />
        <Input
          label="Policy Name *"
          value={formData.name}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Ignore Car Ownership"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={2}
          value={formData.description}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
          placeholder="Describe what this policy does..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Policy Type *"
          options={policyTypes.map((t: any) => ({ value: t.value, label: t.label }))}
          value={formData.policyType}
          onChange={(value) => setFormData((prev: any) => ({ ...prev, policyType: value }))}
        />
        <Select
          label="Action *"
          options={actions.map((a: any) => ({ value: a.value, label: a.label }))}
          value={formData.action}
          onChange={(value) => setFormData((prev: any) => ({ ...prev, action: value }))}
        />
      </div>

      {/* Rules Section */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-900">Rules</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Logic:</span>
            <Select
              options={[
                { value: 'AND', label: 'AND (all match)' },
                { value: 'OR', label: 'OR (any match)' }
              ]}
              value={formData.ruleLogic}
              onChange={(value) => setFormData((prev: any) => ({ ...prev, ruleLogic: value }))}
              className="w-36"
            />
          </div>
        </div>

        <div className="space-y-3">
          {formData.rules.map((rule: PolicyRule, index: number) => {
            const selectedField = fields.find(f => f.field === rule.field);
            const applicableOperators = getOperatorsForField(rule.field);

            return (
              <div key={index} className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                <Select
                  options={[
                    { value: '', label: 'Select field...' },
                    ...Object.entries(fieldsByCategory).flatMap(([category, categoryFields]) => [
                      { value: `__category_${category}`, label: `── ${category.toUpperCase()} ──`, disabled: true },
                      ...categoryFields.map(f => ({ value: f.field, label: f.label }))
                    ])
                  ]}
                  value={rule.field}
                  onChange={(value) => updateRule(index, { field: value, value: '' })}
                  className="flex-1"
                />
                <Select
                  options={applicableOperators.map((op: any) => ({ value: op.value, label: op.label }))}
                  value={rule.operator}
                  onChange={(value) => updateRule(index, { operator: value })}
                  className="w-40"
                />
                {selectedField?.type === 'boolean' || ['is_true', 'is_false'].includes(rule.operator) ? (
                  <div className="w-24 text-sm text-gray-500 text-center">-</div>
                ) : selectedField?.type === 'select' && selectedField.options ? (
                  <Select
                    options={selectedField.options.map(opt => ({ value: opt, label: opt }))}
                    value={String(rule.value)}
                    onChange={(value) => updateRule(index, { value })}
                    className="w-32"
                  />
                ) : (
                  <Input
                    type={selectedField?.type === 'number' ? 'number' : 'text'}
                    value={String(rule.value)}
                    onChange={(e) => updateRule(index, { 
                      value: selectedField?.type === 'number' ? Number(e.target.value) : e.target.value 
                    })}
                    placeholder="Value"
                    className="w-32"
                  />
                )}
                {formData.rules.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeRule(index)}>
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={addRule} className="mt-3">
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Target Criteria (for ignore_criterion action) */}
      {formData.action === 'ignore_criterion' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Classification Criteria
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Select which AI classification criteria this policy should ignore
          </p>
          <div className="flex flex-wrap gap-2 p-3 border rounded-lg max-h-32 overflow-y-auto">
            {targetCriteriaOptions.map((criteria) => (
              <button
                key={criteria}
                type="button"
                onClick={() => {
                  setFormData((prev: any) => ({
                    ...prev,
                    targetCriteria: prev.targetCriteria.includes(criteria)
                      ? prev.targetCriteria.filter((c: string) => c !== criteria)
                      : [...prev.targetCriteria, criteria]
                  }));
                }}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  formData.targetCriteria.includes(criteria)
                    ? 'bg-primary-100 border-primary-300 text-primary-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {criteria}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Additional Settings */}
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Priority"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, priority: Number(e.target.value) }))}
          helperText="Higher = applied first"
        />
        <Input
          label="Effective From"
          type="date"
          value={formData.effectiveFrom}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, effectiveFrom: e.target.value }))}
        />
        <Input
          label="Effective Until"
          type="date"
          value={formData.effectiveUntil}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, effectiveUntil: e.target.value }))}
          helperText="Leave empty for no end"
        />
      </div>
    </div>
  );
};

export default PolicyConfiguration;
