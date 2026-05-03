import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  IndianRupee,
  Calendar,
  Heart
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardDescription,
  Button,
  Badge,
  Spinner,
  Alert,
  CustomPieChart
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { CHART_COLORS, WELFARE_SCHEMES, BPL_THRESHOLD } from '@/utils/constants';
import { familyService } from '@/services';
import { Family } from '@/types/family';
import { useWorkerBankAccounts } from '@/hooks/useWorkerBankAccounts';
import api from '@/services/api';

interface WelfareSchemeFromAPI {
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
  isEligible?: boolean;
}

interface BPLStatusData {
  status: 'eligible' | 'not_eligible' | 'pending';
  annualIncome: number;
  threshold: number;
  lastVerified: string;
  certificateId?: string;
  eligibleSchemes: {
    id: string;
    name: string;
    description: string;
  }[];
  incomeBreakdown: {
    source: string;
    amount: number;
    percentage: number;
  }[];
  verificationHistory: {
    date: string;
    status: 'eligible' | 'not_eligible';
    income: number;
  }[];
}

const buildBplData = (annualIncome: number, hasLinkedAccounts: boolean): BPLStatusData => {
  const status: BPLStatusData['status'] = hasLinkedAccounts
    ? (annualIncome <= BPL_THRESHOLD ? 'eligible' : 'not_eligible')
    : 'pending';

  return {
    status,
    annualIncome,
    threshold: BPL_THRESHOLD,
    lastVerified: new Date().toISOString(),
    eligibleSchemes: WELFARE_SCHEMES.map((name, index) => ({
      id: `scheme-${index + 1}`,
      name,
      description: 'Government welfare scheme for BPL families'
    })),
    incomeBreakdown: [],
    verificationHistory: []
  };
};

const BPLStatus: React.FC = () => {
  const [data, setData] = useState<BPLStatusData | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [classificationMessage, setClassificationMessage] = useState<string | null>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const [liveSchemes, setLiveSchemes] = useState<WelfareSchemeFromAPI[]>([]);
  const {
    accounts,
    totalMonthlyIncome,
    loading: accountsLoading,
    error: accountsError
  } = useWorkerBankAccounts();

  useEffect(() => {
    fetchData();
    fetchLiveSchemes();
  }, []);

  useEffect(() => {
    if (accountsLoading) return;

    const hasLinkedAccounts = accounts.length > 0;
    const annualIncome = hasLinkedAccounts ? totalMonthlyIncome * 12 : 0;
    const baseData = buildBplData(annualIncome, hasLinkedAccounts);
    const totalAnnualFromAccounts = accounts.reduce(
      (sum, account) => sum + (account.monthlyIncome || 0) * 12,
      0
    );

    const incomeBreakdown = hasLinkedAccounts
      ? accounts.map((account) => {
          const amount = (account.monthlyIncome || 0) * 12;
          const percentage = totalAnnualFromAccounts > 0
            ? Math.round((amount / totalAnnualFromAccounts) * 100)
            : 0;
          const label = account.accountNumberMasked
            ? `${account.bankName} • ${account.accountNumberMasked}`
            : account.bankName;
          return { source: label, amount, percentage };
        })
      : [];

    setData({
      ...baseData,
      incomeBreakdown
    });
  }, [accounts, accountsLoading, totalMonthlyIncome]);

  const fetchLiveSchemes = async () => {
    try {
      const response: any = await api.get('/workers/welfare-schemes');
      if (response.success && response.data) {
        setLiveSchemes(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch welfare schemes:', err);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const familyData = await familyService.getMyFamily();
      setFamily(familyData.family);
    } catch (error) {
      console.error('Error fetching family data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setClassificationMessage(null);
    setClassificationError(null);
    
    try {
      // Call the AI model to reclassify the family
      const result = await familyService.reclassifyFamily();
      
      if (result.data?.family) {
        setFamily(result.data.family);
        
        // Show success message with classification details
        const classification = result.data.family.classification;
        const confidence = result.data.family.classification_confidence || 0;
        const reason = result.data.family.classification_reason || '';
        
        setClassificationMessage(
          `Classification updated: ${classification} (${confidence}% confidence). ${reason}`
        );
      }
      
      // Also refresh other data
      await fetchData();
    } catch (error: any) {
      console.error('Error reclassifying family:', error);
      setClassificationError(error.message || 'Failed to refresh classification. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading || accountsLoading || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasLinkedAccounts = accounts.length > 0;

  const incomePercentage = data.annualIncome > 0
    ? (data.annualIncome / data.threshold) * 100
    : 0;
  const remainingBuffer = data.threshold - data.annualIncome;

  const pieChartData = data.incomeBreakdown.map(item => ({
    name: item.source,
    value: item.amount,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BPL Status</h1>
          <p className="text-gray-500 mt-1">Below Poverty Line eligibility verification</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Classifying...' : 'Refresh Status'}
          </Button>
          {data.certificateId && (
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Download Certificate
            </Button>
          )}
        </div>
      </div>

      {/* Classification Success/Error Messages */}
      {classificationMessage && (
        <Alert variant="success" onClose={() => setClassificationMessage(null)}>
          <CheckCircle className="h-4 w-4" />
          <span>{classificationMessage}</span>
        </Alert>
      )}
      
      {classificationError && (
        <Alert variant="error" onClose={() => setClassificationError(null)}>
          <XCircle className="h-4 w-4" />
          <span>{classificationError}</span>
        </Alert>
      )}

      {/* APL/BPL Classification Status Card */}
      {family && family.classification && family.classification !== 'pending' && (
        <Card className={`border-2 ${family.classification === 'BPL' ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'}`}>
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-full ${family.classification === 'BPL' ? 'bg-orange-200' : 'bg-green-200'}`}>
                  {family.classification === 'BPL' ? (
                    <Shield className={`h-8 w-8 text-orange-700`} />
                  ) : (
                    <Shield className={`h-8 w-8 text-green-700`} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-2xl font-bold ${family.classification === 'BPL' ? 'text-orange-800' : 'text-green-800'}`}>
                      {family.classification === 'BPL' ? 'Below Poverty Line' : 'Above Poverty Line'}
                    </h2>
                    <Badge variant={family.classification === 'BPL' ? 'warning' : 'success'}>
                      {family.classification}
                    </Badge>
                  </div>
                  <p className={`text-sm ${family.classification === 'BPL' ? 'text-orange-600' : 'text-green-600'}`}>
                    {family.classification_reason || 'Classification completed'}
                  </p>
                  {family.classification_confidence > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      Confidence: {family.classification_confidence}%
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* SECC Analysis Details */}
            {(family.secc_deprivation_count > 0 || family.secc_exclusion_met?.length > 0 || family.secc_inclusion_met?.length > 0) && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">SECC 2011 Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {family.secc_inclusion_met && family.secc_inclusion_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-green-700 mb-2">✅ Inclusion Criteria</p>
                      <ul className="text-gray-600 space-y-1">
                        {family.secc_inclusion_met.map((item, idx) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {family.secc_exclusion_met && family.secc_exclusion_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-red-700 mb-2">❌ Exclusion Criteria</p>
                      <ul className="text-gray-600 space-y-1">
                        {family.secc_exclusion_met.map((item, idx) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {family.secc_deprivation_met && family.secc_deprivation_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-orange-700 mb-2">⚠️ Deprivation Indicators ({family.secc_deprivation_count})</p>
                      <ul className="text-gray-600 space-y-1">
                        {family.secc_deprivation_met.map((item, idx) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recommendation Message */}
            {family.recommendation_message && (
              <div className="mt-4 p-3 bg-white rounded-lg">
                <p className="text-sm text-gray-700">{family.recommendation_message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Income Overview */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Income Stats */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Your Annual Income</p>
              <IndianRupee className="h-5 w-5 text-gray-400" />
            </div>
            {hasLinkedAccounts ? (
              <>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.annualIncome)}</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-500">Threshold: {formatCurrency(data.threshold)}</span>
                    <span className={`font-medium ${data.status === 'eligible' ? 'text-green-600' : 'text-red-600'}`}>
                      {incomePercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${data.status === 'eligible' ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(incomePercentage, 100)}%` }}
                    />
                  </div>
                  {data.status === 'eligible' && (
                    <p className="text-sm text-gray-500 mt-2">
                      Buffer remaining: <span className="font-medium text-green-600">{formatCurrency(remainingBuffer)}</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-2">
                <p className="text-lg font-semibold text-gray-800">Link a bank account</p>
                <p className="text-sm text-gray-500 mt-1">
                  Your annual income will appear once an account is connected.
                </p>
                {accountsError && (
                  <p className="text-xs text-red-600 mt-2">{accountsError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Income Breakdown</CardTitle>
            <CardDescription>Distribution of your income by source</CardDescription>
          </CardHeader>
          <CardContent>
            {hasLinkedAccounts && data.incomeBreakdown.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-48 h-48">
                  <CustomPieChart
                    data={pieChartData}
                    height={180}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  {data.incomeBreakdown.map((item, index) => (
                    <div key={item.source} className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS.array[index % CHART_COLORS.array.length] }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.source}</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: `${item.percentage}%`,
                              backgroundColor: CHART_COLORS.array[index % CHART_COLORS.array.length]
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Link a bank account to see an income breakdown by source.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Welfare Schemes from Government */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Government Welfare Schemes
          </CardTitle>
          <CardDescription>
            Active welfare programs — schemes you qualify for are highlighted
          </CardDescription>
        </CardHeader>
        <CardContent>
          {liveSchemes.length > 0 ? (
            <>
              {/* Eligibility summary */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  You are eligible for <strong>{liveSchemes.filter(s => s.isEligible).length}</strong> out of{' '}
                  <strong>{liveSchemes.length}</strong> active welfare schemes.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Sort eligible schemes first */}
                {[...liveSchemes]
                  .sort((a, b) => (b.isEligible ? 1 : 0) - (a.isEligible ? 1 : 0))
                  .map((scheme) => (
                  <div 
                    key={scheme._id}
                    className={`p-4 border rounded-lg transition-colors ${
                      scheme.isEligible
                        ? 'border-green-300 bg-green-50 hover:border-green-400 ring-1 ring-green-200' 
                        : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="primary" className="text-xs">{scheme.category}</Badge>
                      <Badge 
                        variant={scheme.eligibilityCriteria?.incomeCategory === 'BPL' ? 'warning' : 
                                scheme.eligibilityCriteria?.incomeCategory === 'APL' ? 'success' : 'primary'}
                        className="text-xs"
                      >
                        {scheme.eligibilityCriteria?.incomeCategory === 'both' ? 'All' : scheme.eligibilityCriteria?.incomeCategory}
                      </Badge>
                      {scheme.isEligible && (
                        <Badge variant="success" className="text-xs ml-auto">
                          <CheckCircle className="h-3 w-3 mr-1 inline" />
                          Eligible
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900">{scheme.name}</h4>
                    <p className="text-xs text-gray-400">{scheme.code}</p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{scheme.description}</p>
                    {scheme.benefits?.amount > 0 && (
                      <p className="text-sm font-medium text-green-600 mt-2">
                        {formatCurrency(scheme.benefits.amount)}
                        <span className="text-xs text-gray-400 ml-1">/{scheme.benefits.frequency}</span>
                      </p>
                    )}
                    {scheme.eligibilityCriteria?.maxAnnualIncome && (
                      <p className="text-xs text-gray-500 mt-1">
                        Max income: {formatCurrency(scheme.eligibilityCriteria.maxAnnualIncome)}/yr
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      {!scheme.isEligible && (
                        <Badge variant="default" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1 inline" />
                          Not Eligible
                        </Badge>
                      )}
                      {scheme.ministry && (
                        <span className="text-xs text-gray-400 ml-auto">{scheme.ministry}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Heart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No active welfare schemes available at the moment.</p>
              <p className="text-sm text-gray-400 mt-1">Check back later for new government programs.</p>
            </div>
          )}
          
          {/* Also show family-specific eligible schemes if available */}
          {family && family.eligible_schemes && family.eligible_schemes.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Your Personally Eligible Schemes</h4>
              <div className="flex flex-wrap gap-2">
                {family.eligible_schemes.map((scheme, idx) => (
                  <Badge key={idx} variant="primary" className="text-sm px-3 py-1">
                    {scheme}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            Verification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.verificationHistory.map((record, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${record.status === 'eligible' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {record.status === 'eligible' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {record.status === 'eligible' ? 'BPL Eligible' : 'Not Eligible'}
                    </p>
                    <p className="text-sm text-gray-500">{formatDate(record.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{formatCurrency(record.income)}</p>
                  <p className="text-sm text-gray-500">Annual Income</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Information Alert */}
      <Alert variant="info">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">Blockchain Verified</p>
            <p className="text-sm text-blue-700 mt-1">
              Your BPL status is calculated based on immutable wage records stored on the Hyperledger Fabric blockchain. 
              This ensures transparent and tamper-proof verification of your income.
            </p>
          </div>
        </div>
      </Alert>
    </div>
  );
};

export default BPLStatus;
