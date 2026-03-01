import React, { useState, useEffect } from 'react';
import { Heart, Search, RefreshCw, Users, IndianRupee } from 'lucide-react';
import {
  Card,
  CardContent,
  Badge,
  Spinner,
  Alert,
  Input,
  Select,
} from '@/components/common';
import { formatCurrency } from '@/utils/formatters';
import api from '@/services/api';

interface WelfareScheme {
  _id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  eligibilityCriteria: {
    incomeCategory: string;
    maxAnnualIncome?: number;
    minAge?: number;
    maxAge?: number;
    gender: string;
  };
  benefits: {
    type: string;
    amount: number;
    frequency: string;
    description: string;
  };
  status: string;
  startDate?: string;
  endDate?: string;
  currentBeneficiaries: number;
  maxBeneficiaries?: number;
  ministry?: string;
  department?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: 'bg-orange-100 text-orange-800',
  housing: 'bg-blue-100 text-blue-800',
  education: 'bg-purple-100 text-purple-800',
  health: 'bg-red-100 text-red-800',
  employment: 'bg-green-100 text-green-800',
  pension: 'bg-yellow-100 text-yellow-800',
  skill: 'bg-indigo-100 text-indigo-800',
  other: 'bg-gray-100 text-gray-800',
};

const EmployerWelfare: React.FC = () => {
  const [schemes, setSchemes] = useState<WelfareScheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [incomeFilter, setIncomeFilter] = useState('all');

  useEffect(() => {
    fetchSchemes();
  }, []);

  const fetchSchemes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response: any = await api.get('/employers/welfare-schemes');
      if (response.success && response.data) {
        setSchemes(response.data);
      } else {
        setSchemes([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch welfare schemes');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSchemes = schemes.filter((scheme) => {
    const matchesSearch =
      !searchQuery ||
      scheme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scheme.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scheme.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === 'all' || scheme.category === categoryFilter;

    const matchesIncome =
      incomeFilter === 'all' ||
      scheme.eligibilityCriteria?.incomeCategory === incomeFilter ||
      scheme.eligibilityCriteria?.incomeCategory === 'both';

    return matchesSearch && matchesCategory && matchesIncome;
  });

  const stats = {
    total: schemes.length,
    bplTargeted: schemes.filter(
      (s) => s.eligibilityCriteria?.incomeCategory === 'BPL'
    ).length,
    aplTargeted: schemes.filter(
      (s) => s.eligibilityCriteria?.incomeCategory === 'APL'
    ).length,
    universal: schemes.filter(
      (s) => s.eligibilityCriteria?.incomeCategory === 'both'
    ).length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welfare Schemes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active government welfare programs your workers may be eligible for
          </p>
        </div>
        <button
          onClick={fetchSchemes}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Heart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-gray-500">Total Schemes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.bplTargeted}</p>
                <p className="text-xs text-gray-500">BPL Targeted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.aplTargeted}</p>
                <p className="text-xs text-gray-500">APL Targeted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <IndianRupee className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.universal}</p>
                <p className="text-xs text-gray-500">All Income Groups</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search schemes by name, code, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
            </div>
            <Select
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(val)}
              options={[
                { value: 'all', label: 'All Categories' },
                { value: 'food', label: 'Food' },
                { value: 'housing', label: 'Housing' },
                { value: 'education', label: 'Education' },
                { value: 'health', label: 'Health' },
                { value: 'employment', label: 'Employment' },
                { value: 'pension', label: 'Pension' },
                { value: 'skill', label: 'Skill Development' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Select
              value={incomeFilter}
              onChange={(val) => setIncomeFilter(val)}
              options={[
                { value: 'all', label: 'All Income Groups' },
                { value: 'BPL', label: 'BPL Only' },
                { value: 'APL', label: 'APL Only' },
                { value: 'both', label: 'Universal' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Schemes Grid */}
      {filteredSchemes.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSchemes.map((scheme) => (
            <Card key={scheme._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      CATEGORY_COLORS[scheme.category] || CATEGORY_COLORS.other
                    }`}
                  >
                    {scheme.category}
                  </span>
                  <Badge
                    variant={
                      scheme.eligibilityCriteria?.incomeCategory === 'BPL'
                        ? 'warning'
                        : scheme.eligibilityCriteria?.incomeCategory === 'APL'
                        ? 'success'
                        : 'primary'
                    }
                    className="text-xs"
                  >
                    {scheme.eligibilityCriteria?.incomeCategory === 'both'
                      ? 'All Income Groups'
                      : `${scheme.eligibilityCriteria?.incomeCategory} Only`}
                  </Badge>
                </div>

                <h3 className="font-semibold text-gray-900">{scheme.name}</h3>
                <p className="text-xs text-gray-400 mb-1">{scheme.code}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                  {scheme.description}
                </p>

                {/* Benefits */}
                {scheme.benefits?.amount > 0 && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-green-700">
                      <IndianRupee className="h-3 w-3 inline" />
                      {formatCurrency(scheme.benefits.amount)}
                      <span className="text-xs text-green-500 ml-1">
                        / {scheme.benefits.frequency}
                      </span>
                    </p>
                    <p className="text-xs text-green-600 capitalize">
                      {scheme.benefits.type} benefit
                    </p>
                  </div>
                )}

                {/* Eligibility Details */}
                <div className="mt-3 space-y-1">
                  {scheme.eligibilityCriteria?.maxAnnualIncome && (
                    <p className="text-xs text-gray-500">
                      Max Income: {formatCurrency(scheme.eligibilityCriteria.maxAnnualIncome)}/year
                    </p>
                  )}
                  {(scheme.eligibilityCriteria?.minAge || scheme.eligibilityCriteria?.maxAge) && (
                    <p className="text-xs text-gray-500">
                      Age: {scheme.eligibilityCriteria.minAge || 0} -{' '}
                      {scheme.eligibilityCriteria.maxAge || '∞'} years
                    </p>
                  )}
                  {scheme.eligibilityCriteria?.gender !== 'all' && (
                    <p className="text-xs text-gray-500 capitalize">
                      Gender: {scheme.eligibilityCriteria?.gender} only
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Users className="h-3 w-3" />
                    {scheme.currentBeneficiaries?.toLocaleString() || 0} beneficiaries
                  </div>
                  {scheme.ministry && (
                    <span className="text-xs text-gray-400">{scheme.ministry}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No Schemes Found</h3>
              <p className="text-gray-500 mt-1">
                {searchQuery || categoryFilter !== 'all' || incomeFilter !== 'all'
                  ? 'Try adjusting your filters to see more schemes.'
                  : 'No active welfare schemes are available at the moment.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmployerWelfare;
