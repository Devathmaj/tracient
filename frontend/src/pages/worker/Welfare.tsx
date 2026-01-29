import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  RefreshCw,
  IndianRupee,
  Calendar,
  Heart,
  AlertTriangle,
  Play,
  History,
  ShieldCheck,
  ShieldX,
  CheckCircle
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
  CustomPieChart,
  Select
} from '@/components/common';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { CHART_COLORS, BPL_THRESHOLD } from '@/utils/constants';
import { get, post } from '@/services/api';
import { familyService } from '@/services';

interface ClassificationData {
  classification: 'APL' | 'BPL';
  annualIncome: number;
  mlConfidence: number;
  mlClassification: 'APL' | 'BPL';
  seccClassification: 'APL' | 'BPL';
  year: number;
  attemptNumber: number;
  createdAt: string;
  incomeBreakdown: Array<{
    source: string;
    amount: number;
    percentage: number;
    verified: boolean;
    transactionCount: number;
  }>;
  monthlyIncome: Array<{
    monthName: string;
    amount: number;
    verified: number;
    unverified: number;
  }>;
  verificationStats: {
    totalVerified: number;
    totalUnverified: number;
    verifiedPercentage: number;
  };
  eligibleSchemes: string[];
}

interface ClassificationHistory {
  history: ClassificationData[];
  availableYears: number[];
  currentYear: number;
}

const BPLStatus: React.FC = () => {
  const [classification, setClassification] = useState<ClassificationData | null>(null);
  const [familyClassification, setFamilyClassification] = useState<any>(null);
  const [history, setHistory] = useState<ClassificationHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAttempting, setIsAttempting] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(6);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (history?.availableYears?.length) {
      fetchHistoryByYear(selectedYear);
    }
  }, [selectedYear]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    let hasData = false;
    
    try {
      // Try to fetch classification from new WelfareClassification model
      try {
        const classRes = await get<{ success: boolean; data: any }>('/workers/profile/welfare-classification');
        if (classRes.success && classRes.data?.hasClassification) {
          setClassification(classRes.data.classification);
          hasData = true;
        }
      } catch (e) {
        console.log('No classification from new model');
      }
      
      // Try to fetch from Family model as fallback
      try {
        const familyData = await familyService.getMyFamily();
        if (familyData.family && familyData.family.classification && familyData.family.classification !== 'pending') {
          setFamilyClassification(familyData.family);
          hasData = true;
        }
      } catch (e) {
        console.log('No family classification');
      }
      
      // Try to fetch classification history
      try {
        const historyRes = await get<{ success: boolean; data: ClassificationHistory }>('/workers/profile/welfare-classification/history');
        if (historyRes.success && historyRes.data) {
          setHistory(historyRes.data);
          setSelectedYear(historyRes.data.currentYear);
        }
      } catch (e) {
        console.log('No classification history');
      }
      
      // Try to fetch attempts remaining
      try {
        const attemptsRes = await get<{ success: boolean; data: { remaining: number; used: number; max: number } }>('/workers/profile/welfare-classification/attempts-remaining');
        if (attemptsRes.success && attemptsRes.data) {
          setAttemptsRemaining(attemptsRes.data.remaining);
        }
      } catch (e) {
        console.log('Could not fetch attempts remaining');
      }
      
      // Only show error if we have absolutely no data
      if (!hasData) {
        setError('No classification data found. Click "Attempt Classification" to get started.');
      }
    } catch (error: any) {
      console.error('Error fetching classification data:', error);
      setError('Failed to load classification data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistoryByYear = async (year: number) => {
    try {
      const historyRes = await get<{ success: boolean; data: ClassificationHistory }>(`/workers/profile/welfare-classification/history?year=${year}`);
      if (historyRes.success && historyRes.data) {
        setHistory(prev => prev ? { ...prev, history: historyRes.data.history } : historyRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch history for year:', year);
    }
  };

  const handleAttemptClassification = async () => {
    if (attemptsRemaining <= 0) {
      setError('You have used all 6 classification attempts for this year.');
      return;
    }
    
    setIsAttempting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await post<{ success: boolean; data: { classification: ClassificationData }; message?: string }>('/workers/profile/welfare-classification/attempt', {});
      
      if (response.success && response.data?.classification) {
        setClassification(response.data.classification);
        setAttemptsRemaining(prev => prev - 1);
        setSuccessMessage(`Classification completed! You are classified as ${response.data.classification.classification}.`);
        // Refresh history
        fetchHistoryByYear(selectedYear);
      } else {
        setError(response.message || 'Failed to complete classification. Please try again.');
      }
    } catch (error: any) {
      console.error('Classification attempt failed:', error);
      setError(error.response?.data?.message || 'Failed to complete classification. Please try again.');
    } finally {
      setIsAttempting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const isBPL = classification?.classification === 'BPL';
  const pieChartData = classification?.incomeBreakdown?.map(item => ({
    name: item.source,
    value: item.amount,
  })) || [];

  const yearOptions = history?.availableYears?.map(y => ({ value: y.toString(), label: y.toString() })) || 
    [{ value: new Date().getFullYear().toString(), label: new Date().getFullYear().toString() }];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">APL/BPL Classification</h1>
          <p className="text-gray-500 mt-1">AI-powered welfare eligibility classification</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <Alert variant="error">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </Alert>
      )}
      
      {successMessage && (
        <Alert variant="success">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {successMessage}
          </div>
        </Alert>
      )}

      {/* Re-attempt Classification Card */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-blue-900">Classification Survey</h3>
              <p className="text-sm text-blue-700 mt-1">
                You can attempt the APL/BPL classification survey up to 6 times per year.
              </p>
              <p className="text-sm text-blue-600 mt-1">
                <strong>{attemptsRemaining}</strong> attempts remaining for {new Date().getFullYear()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-3 h-3 rounded-full ${i < (6 - attemptsRemaining) ? 'bg-blue-500' : 'bg-blue-200'}`}
                  />
                ))}
              </div>
              <Button 
                onClick={handleAttemptClassification} 
                disabled={isAttempting || attemptsRemaining <= 0}
              >
                {isAttempting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Attempt Classification
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Classification Status Card */}
      {classification && (
        <Card className={`border-2 ${isBPL ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'}`}>
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-full ${isBPL ? 'bg-orange-200' : 'bg-green-200'}`}>
                  <Shield className={`h-8 w-8 ${isBPL ? 'text-orange-700' : 'text-green-700'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-2xl font-bold ${isBPL ? 'text-orange-800' : 'text-green-800'}`}>
                      {isBPL ? 'Below Poverty Line' : 'Above Poverty Line'}
                    </h2>
                    <Badge variant={isBPL ? 'warning' : 'success'}>
                      {classification.classification}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Annual Income: <strong>{formatCurrency(classification.annualIncome)}</strong>
                  </p>
                  {classification.mlConfidence > 0 && (
                    <p className="text-sm text-gray-500">
                      AI Confidence: {classification.mlConfidence}% • Attempt #{classification.attemptNumber} of {classification.year}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Classified on: {formatDate(classification.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Stats */}
            {classification.verificationStats && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-xs text-gray-500">Verified Income</p>
                      <p className="font-semibold text-green-700">{formatCurrency(classification.verificationStats.totalVerified)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldX className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-xs text-gray-500">Unverified Income</p>
                      <p className="font-semibold text-orange-600">{formatCurrency(classification.verificationStats.totalUnverified)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Verification Rate</p>
                    <p className="font-semibold text-gray-900">{classification.verificationStats.verifiedPercentage}%</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Classification Message */}
      {!classification && !familyClassification && (
        <Card className="border-2 border-gray-200 bg-gray-50">
          <CardContent className="py-8 text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No Classification Found</h3>
            <p className="text-gray-500 mt-1">
              You haven't completed an APL/BPL classification yet. Click "Attempt Classification" above to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Family-based Classification (fallback) */}
      {!classification && familyClassification && (
        <Card className={`border-2 ${familyClassification.classification === 'BPL' ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'}`}>
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-full ${familyClassification.classification === 'BPL' ? 'bg-orange-200' : 'bg-green-200'}`}>
                  <Shield className={`h-8 w-8 ${familyClassification.classification === 'BPL' ? 'text-orange-700' : 'text-green-700'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-2xl font-bold ${familyClassification.classification === 'BPL' ? 'text-orange-800' : 'text-green-800'}`}>
                      {familyClassification.classification === 'BPL' ? 'Below Poverty Line' : 'Above Poverty Line'}
                    </h2>
                    <Badge variant={familyClassification.classification === 'BPL' ? 'warning' : 'success'}>
                      {familyClassification.classification}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {familyClassification.classification_reason || 'Classification from family survey'}
                  </p>
                  {familyClassification.classification_confidence > 0 && (
                    <p className="text-sm text-gray-500">
                      AI Confidence: {familyClassification.classification_confidence}%
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* SECC Analysis Details */}
            {(familyClassification.secc_deprivation_count > 0 || familyClassification.secc_exclusion_met?.length > 0 || familyClassification.secc_inclusion_met?.length > 0) && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">SECC 2011 Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {familyClassification.secc_inclusion_met && familyClassification.secc_inclusion_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-green-700 mb-2">✅ Inclusion Criteria</p>
                      <ul className="text-gray-600 space-y-1">
                        {familyClassification.secc_inclusion_met.map((item: string, idx: number) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {familyClassification.secc_exclusion_met && familyClassification.secc_exclusion_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-red-700 mb-2">❌ Exclusion Criteria</p>
                      <ul className="text-gray-600 space-y-1">
                        {familyClassification.secc_exclusion_met.map((item: string, idx: number) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {familyClassification.secc_deprivation_met && familyClassification.secc_deprivation_met.length > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <p className="font-medium text-orange-700 mb-2">⚠️ Deprivation Indicators ({familyClassification.secc_deprivation_count})</p>
                      <ul className="text-gray-600 space-y-1">
                        {familyClassification.secc_deprivation_met.map((item: string, idx: number) => (
                          <li key={idx} className="text-xs">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Eligible Schemes */}
            {familyClassification.eligible_schemes && familyClassification.eligible_schemes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Eligible Welfare Schemes</h4>
                <div className="flex flex-wrap gap-2">
                  {familyClassification.eligible_schemes.map((scheme: string, idx: number) => (
                    <Badge key={idx} variant="primary" className="text-sm">
                      {scheme}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Income Overview */}
      {classification && classification.incomeBreakdown && classification.incomeBreakdown.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Income Stats */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Your Annual Income</p>
                <IndianRupee className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(classification.annualIncome)}</p>
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500">BPL Threshold: {formatCurrency(BPL_THRESHOLD)}</span>
                  <span className={`font-medium ${isBPL ? 'text-green-600' : 'text-red-600'}`}>
                    {((classification.annualIncome / BPL_THRESHOLD) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${isBPL ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min((classification.annualIncome / BPL_THRESHOLD) * 100, 100)}%` }}
                  />
                </div>
                {isBPL && (
                  <p className="text-sm text-gray-500 mt-2">
                    Buffer remaining: <span className="font-medium text-green-600">{formatCurrency(BPL_THRESHOLD - classification.annualIncome)}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Income Breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Income Breakdown by Source</CardTitle>
              <CardDescription>Distribution of your income with verification status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-48 h-48">
                  <CustomPieChart
                    data={pieChartData}
                    height={180}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  {classification.incomeBreakdown.map((item, index) => (
                    <div key={item.source} className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS.array[index % CHART_COLORS.array.length] }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">{item.source}</span>
                            {item.verified ? (
                              <ShieldCheck className="h-3 w-3 text-green-500" />
                            ) : (
                              <ShieldX className="h-3 w-3 text-orange-400" />
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                          <span>{item.percentage}% of total</span>
                          <span>{item.transactionCount || 0} transactions</span>
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Eligible Welfare Schemes */}
      {isBPL && classification?.eligibleSchemes && classification.eligibleSchemes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Eligible Welfare Schemes
            </CardTitle>
            <CardDescription>
              Based on your BPL status, you are eligible for the following government schemes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {classification.eligibleSchemes.map((scheme, idx) => (
                <Badge key={idx} variant="primary" className="text-sm px-3 py-1">
                  {scheme}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classification History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-gray-400" />
              Classification History
            </CardTitle>
            <Select
              options={yearOptions}
              value={selectedYear.toString()}
              onChange={(val) => setSelectedYear(parseInt(val))}
              className="w-32"
            />
          </div>
        </CardHeader>
        <CardContent>
          {history && history.history && history.history.length > 0 ? (
            <div className="space-y-4">
              {history.history.map((record, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${record.classification === 'BPL' ? 'bg-orange-100' : 'bg-green-100'}`}>
                      {record.classification === 'BPL' ? (
                        <Shield className="h-5 w-5 text-orange-600" />
                      ) : (
                        <Shield className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {record.classification === 'BPL' ? 'Below Poverty Line' : 'Above Poverty Line'}
                        </p>
                        <Badge variant={record.classification === 'BPL' ? 'warning' : 'success'} className="text-xs">
                          {record.classification}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        Attempt #{record.attemptNumber} • {formatDate(record.createdAt)}
                      </p>
                      {record.mlConfidence > 0 && (
                        <p className="text-xs text-gray-400">AI Confidence: {record.mlConfidence}%</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatCurrency(record.annualIncome)}</p>
                    <p className="text-sm text-gray-500">Annual Income</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No classification history for {selectedYear}</p>
              <p className="text-sm text-gray-400 mt-1">Try selecting a different year or attempt a classification</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Alert */}
      <Alert variant="info">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">AI-Powered Classification</p>
            <p className="text-sm text-blue-700 mt-1">
              Your APL/BPL status is calculated using our AI model trained on SECC 2011 criteria and your verified income records.
              Employer-verified income is given higher weightage than self-declared income for accurate classification.
            </p>
          </div>
        </div>
      </Alert>
    </div>
  );
};

export default BPLStatus;
