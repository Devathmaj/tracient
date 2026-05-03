import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Building2, 
  CreditCard, 
  ArrowRight, 
  CheckCircle2,
  Briefcase,
  Shield,
  Sparkles
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  Button, 
  Input, 
  Alert 
} from '@/components/common';
import { showToast } from '@/components/common/Toast';
import { useAuth } from '@/hooks/useAuth';
import { panSchema } from '@/utils/validators';

// Validation schema for employer application - only employer-specific fields
// (name, email, phone, aadhaar, ration_no are already filled from worker registration)
const applyEmployerSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  pan: panSchema,
  gstin: z.string().optional().refine(
    (val) => {
      if (!val || val.length === 0) return true;
      return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(val);
    },
    'Invalid GSTIN format'
  ),
});

type ApplyEmployerFormData = z.infer<typeof applyEmployerSchema>;

const ApplyEmployer: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Check if THIS user is already an employer (scoped to user ID)
  const userId = user?.id || '';
  const isAlreadyEmployer = localStorage.getItem(`isAlsoEmployer_${userId}`) === 'true';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplyEmployerFormData>({
    resolver: zodResolver(applyEmployerSchema),
    mode: 'onChange',
  });

  const onSubmit = async (data: ApplyEmployerFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      // Call backend to create Employer profile
      const { default: api } = await import('@/services/api');
      await api.post('/employers/profile/apply', {
        businessName: data.businessName,
        pan: data.pan,
        gstin: data.gstin || '',
      });
      
      // Also save to localStorage for UI role-switching
      const employerData = {
        businessName: data.businessName,
        pan: data.pan,
        gstin: data.gstin || '',
        appliedAt: new Date().toISOString(),
        userId: user?.id,
      };
      
      localStorage.setItem(`employerData_${user?.id}`, JSON.stringify(employerData));
      localStorage.setItem(`isAlsoEmployer_${user?.id}`, 'true');
      
      setIsSuccess(true);
      showToast.success('You are now also registered as an employer!');
    } catch (err: any) {
      setError(err.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedirectToEmployer = async () => {
    // Try to ensure backend profile exists (in case they got stuck in localStorage-only state)
    try {
      const { default: api } = await import('@/services/api');
      const storedData = localStorage.getItem(`employerData_${user?.id}`);
      let payload = { businessName: user?.name || 'My Business', pan: '', gstin: '' };
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          payload = { ...payload, ...parsed };
        } catch (e) {}
      }
      
      await api.post('/employers/profile/apply', payload).catch(() => {});
    } catch (e) {}

    // Switch UI to employer mode by updating user role in localStorage
    if (user) {
      const employerUser = { ...user, role: 'employer' as const };
      updateUser(employerUser);
      window.location.href = '/employer/dashboard';
    }
  };

  // If already an employer, show redirect option
  if (isAlreadyEmployer || isSuccess) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Success Header */}
        <div className="text-center py-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-5 shadow-lg shadow-green-200">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isSuccess ? 'Application Approved!' : 'Employer Access Active'}
          </h1>
          <p className="text-gray-500 mt-2">
            You have employer privileges enabled on your account.
          </p>
        </div>

        {/* Info Card */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900">Dual Role Account</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    You can switch between your Worker and Employer dashboards at any time. 
                    All your worker data remains accessible.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-900">Employer Features</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Record wages, manage workers, upload bulk payments, and access employer-specific analytics.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <Button 
                onClick={handleRedirectToEmployer} 
                className="w-full" 
                size="lg"
              >
                <Building2 className="h-5 w-5 mr-2" />
                Redirect to Employer Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center py-4">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-5 shadow-lg shadow-orange-200">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Apply to be an Employer</h1>
        <p className="text-gray-500 mt-2">
          Expand your account with employer capabilities. Your worker access will remain intact.
        </p>
      </div>

      {/* Already filled info notice */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">Some details are already on file</p>
              <p className="text-xs text-blue-600 mt-1">
                Your name, email, phone number, and Aadhaar are already associated with your account. 
                Only employer-specific information is needed below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-600" />
            Business Information
          </CardTitle>
          <CardDescription>
            Provide your business details to enable employer features
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="error" onClose={() => setError(null)} className="mb-4">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Business Name"
              placeholder="Enter your business or company name"
              leftIcon={<Building2 className="h-5 w-5" />}
              error={errors.businessName?.message}
              {...register('businessName')}
            />

            <Input
              label="PAN Number"
              placeholder="AAAAA0000A"
              leftIcon={<CreditCard className="h-5 w-5" />}
              error={errors.pan?.message}
              {...register('pan')}
            />

            <Input
              label="GSTIN (Optional)"
              placeholder="Enter GSTIN if applicable"
              leftIcon={<CreditCard className="h-5 w-5" />}
              error={errors.gstin?.message}
              {...register('gstin')}
            />

            <div className="pt-2">
              <Button 
                type="submit" 
                className="w-full" 
                size="lg" 
                isLoading={isSubmitting}
              >
                Submit Application
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Benefits section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What you'll get as an Employer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { icon: '💰', title: 'Record Wages', desc: 'Record and track wage payments for your workers' },
              { icon: '📊', title: 'Bulk Upload', desc: 'Upload multiple wage records at once via CSV' },
              { icon: '👥', title: 'Worker Management', desc: 'Manage and view all your registered workers' },
              { icon: '📈', title: 'Payment History', desc: 'Access detailed payment history and insights' },
              { icon: '🛡️', title: 'Welfare Schemes', desc: 'View and manage welfare scheme eligibility for workers' },
            ].map((benefit, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="text-2xl">{benefit.icon}</span>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{benefit.title}</h4>
                  <p className="text-xs text-gray-500">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplyEmployer;
