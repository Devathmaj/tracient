import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Search,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Phone,
  Mail,
  Eye,
  Download
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
  Table,
  Tabs,
  Alert
} from '@/components/common';
import { formatDate, formatNumber } from '@/utils/formatters';
import api from '@/services/api';

interface Organization {
  id: string;
  name: string;
  type: 'employer' | 'government' | 'ngo';
  registrationNumber: string;
  gstin?: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  sector: string;
  employeeCount: number;
  workerCount: number;
  status: 'active' | 'pending' | 'suspended' | 'inactive';
  verificationStatus: 'verified' | 'unverified' | 'pending';
  createdAt: string;
  lastActivity: string;
}

const Organizations: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch employers from API
        const response = await api.get('/employers', {
          params: { limit: 100 }
        });
        
        const employers = response.data?.data || [];
        
        // Map API response to Organization interface
        const mappedOrgs: Organization[] = employers.map((emp: any) => {
          // Determine org type based on companyType
          let orgType: 'employer' | 'government' | 'ngo' = 'employer';
          if (emp.companyType === 'govt') orgType = 'government';
          else if (emp.companyType === 'ngo') orgType = 'ngo';
          
          // Determine status based on isActive and verificationStatus
          let status: 'active' | 'pending' | 'suspended' | 'inactive' = 'active';
          if (!emp.isActive) status = emp.suspendedAt ? 'suspended' : 'inactive';
          else if (emp.verificationStatus === 'pending') status = 'pending';
          
          return {
            id: emp._id,
            name: emp.companyName || 'Unknown Company',
            type: orgType,
            registrationNumber: emp.registrationNumber || emp.panNumber || 'N/A',
            gstin: emp.gstin,
            email: emp.email || emp.user?.email || '',
            phone: emp.phone || '',
            address: emp.address?.street || '',
            city: emp.address?.city || '',
            state: emp.address?.state || '',
            sector: emp.sector || emp.industry || 'other',
            employeeCount: 0, // Not tracked in backend
            workerCount: emp.totalWorkers || emp.activeWorkers || 0,
            status,
            verificationStatus: emp.verificationStatus || 'pending',
            createdAt: emp.createdAt,
            lastActivity: emp.updatedAt || emp.createdAt,
          };
        });
        
        setOrganizations(mappedOrgs);
      } catch (err: any) {
        console.error('Error fetching organizations:', err);
        setError(err.response?.data?.message || 'Failed to load organizations');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrganizations();
  }, []);

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'employer', label: 'Employer' },
    { value: 'government', label: 'Government' },
    { value: 'ngo', label: 'NGO' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'inactive', label: 'Inactive' },
  ];

  const tabs = [
    { id: 'all', label: 'All Organizations' },
    { id: 'employer', label: 'Employers' },
    { id: 'government', label: 'Government' },
    { id: 'ngo', label: 'NGOs' },
  ];

  const getTypeBadge = (type: Organization['type']) => {
    const config = {
      employer: { variant: 'primary' as const, label: 'Employer' },
      government: { variant: 'primary' as const, label: 'Government' },
      ngo: { variant: 'success' as const, label: 'NGO' },
    };
    return config[type];
  };

  const getStatusBadge = (status: Organization['status']) => {
    const config = {
      active: { variant: 'success' as const, label: 'Active' },
      pending: { variant: 'warning' as const, label: 'Pending' },
      suspended: { variant: 'error' as const, label: 'Suspended' },
      inactive: { variant: 'default' as const, label: 'Inactive' },
    };
    return config[status];
  };

  const handleDeleteOrg = (orgId: string) => {
    setOrganizations(prev => prev.filter(o => o.id !== orgId));
    setIsDeleteModalOpen(false);
    setSelectedOrg(null);
  };

  const filteredOrgs = organizations.filter(org => {
    const matchesSearch =
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.sector.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || org.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || org.status === statusFilter;
    const matchesTab = activeTab === 'all' || org.type === activeTab;
    return matchesSearch && matchesType && matchesStatus && matchesTab;
  });

  const columns = [
    {
      key: 'org',
      header: 'Organization',
      render: (org: Organization) => (
        <div>
          <p className="font-medium text-gray-900">{org.name}</p>
          <p className="text-xs text-gray-500">{org.registrationNumber}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (org: Organization) => {
        const type = getTypeBadge(org.type);
        return <Badge variant={type.variant}>{type.label}</Badge>;
      },
    },
    {
      key: 'location',
      header: 'Location',
      render: (org: Organization) => (
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <MapPin className="h-3 w-3" />
          {org.city}, {org.state}
        </div>
      ),
    },
    {
      key: 'workers',
      header: 'Workers',
      render: (org: Organization) => (
        <span className="font-medium">{formatNumber(org.workerCount)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (org: Organization) => {
        const status = getStatusBadge(org.status);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (org: Organization) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(org)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedOrg(org);
              setIsDeleteModalOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
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

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="error" title="Error loading organizations">
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500 mt-1">Manage registered organizations and employers</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Organization
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{organizations.length}</p>
            <p className="text-sm text-gray-500">Total Organizations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {organizations.filter(o => o.type === 'employer').length}
            </p>
            <p className="text-sm text-gray-500">Employers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {organizations.filter(o => o.status === 'active').length}
            </p>
            <p className="text-sm text-gray-500">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {organizations.filter(o => o.status === 'pending').length}
            </p>
            <p className="text-sm text-gray-500">Pending Approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, city, or sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={typeOptions}
              value={typeFilter}
              onChange={setTypeFilter}
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

      {/* Organizations Table */}
      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={filteredOrgs}
            keyField="id"
            emptyMessage="No organizations found matching your criteria"
          />
        </CardContent>
      </Card>

      {/* Organization Detail Modal */}
      <Modal
        isOpen={!!selectedOrg && !isDeleteModalOpen}
        onClose={() => setSelectedOrg(null)}
        title="Organization Details"
        size="lg"
      >
        {selectedOrg && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{selectedOrg.name}</h3>
                <p className="text-sm text-gray-500">{selectedOrg.registrationNumber}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant={getTypeBadge(selectedOrg.type).variant}>
                  {getTypeBadge(selectedOrg.type).label}
                </Badge>
                <Badge variant={getStatusBadge(selectedOrg.status).variant}>
                  {getStatusBadge(selectedOrg.status).label}
                </Badge>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{selectedOrg.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{selectedOrg.phone}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-gray-400 mt-1" />
                  <span>{selectedOrg.address}, {selectedOrg.city}, {selectedOrg.state}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span>Sector: {selectedOrg.sector}</span>
                </div>
                {selectedOrg.gstin && (
                  <div className="text-sm">
                    <span className="text-gray-500">GSTIN:</span> {selectedOrg.gstin}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-700">{selectedOrg.employeeCount}</p>
                <p className="text-sm text-blue-600">Employees</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-700">{formatNumber(selectedOrg.workerCount)}</p>
                <p className="text-sm text-green-600">Registered Workers</p>
              </div>
            </div>

            {/* Dates */}
            <div className="grid md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Registered On</p>
                <p className="font-medium">{formatDate(selectedOrg.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Activity</p>
                <p className="font-medium">{formatDate(selectedOrg.lastActivity)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSelectedOrg(null)}>
                  Close
                </Button>
                <Button variant="primary">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedOrg(null);
        }}
        title="Delete Organization"
      >
        {selectedOrg && (
          <div className="space-y-4">
            <Alert variant="error">
              <p>
                Are you sure you want to delete <strong>{selectedOrg.name}</strong>?
                This will remove all associated data including worker records.
              </p>
            </Alert>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedOrg(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDeleteOrg(selectedOrg.id)}
              >
                Delete Organization
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Organization Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Organization"
        size="lg"
      >
        <div className="space-y-4">
          <Input label="Organization Name" placeholder="Enter organization name" />
          <div className="grid md:grid-cols-2 gap-4">
            <Select
              label="Type"
              options={typeOptions.filter(t => t.value !== 'all')}
            />
            <Input label="Registration Number" placeholder="CIN/GSTIN/Registration" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Email" type="email" placeholder="Enter email" />
            <Input label="Phone" placeholder="Enter phone number" />
          </div>
          <Input label="Address" placeholder="Enter full address" />
          <div className="grid md:grid-cols-3 gap-4">
            <Input label="City" placeholder="Enter city" />
            <Input label="State" placeholder="Enter state" />
            <Input label="Sector" placeholder="Enter business sector" />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Create Organization
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Organizations;
