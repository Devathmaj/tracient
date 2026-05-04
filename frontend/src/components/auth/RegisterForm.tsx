import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { 
  Mail, 
  Lock, 
  User, 
  Phone, 
  Eye, 
  EyeOff, 
  ArrowRight,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, Alert, Modal } from '@/components/common';
import { registerWorkerSchema } from '@/utils/validators';
import { ROUTES } from '@/utils/constants';
import { z } from 'zod';
import { UserRole } from '@/types';

type WorkerFormData = z.infer<typeof registerWorkerSchema>;

// Main RegisterForm Component - directly shows user registration (no role selection)
const RegisterForm: React.FC = () => {
  const { register: registerUser, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [employmentType, setEmploymentType] = useState<'formal' | 'informal'>('informal');
  const [isFarmer, setIsFarmer] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<WorkerFormData>({
    resolver: zodResolver(registerWorkerSchema),
    mode: 'onChange',
    defaultValues: {
      employmentType: 'informal',
      isFarmer: false,
      termsAccepted: false,
    }
  });

  const watchEmploymentType = watch('employmentType');
  const watchIsFarmer = watch('isFarmer');

  const handleFormSubmit = async (data: WorkerFormData) => {
    setError(null);
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        aadhaarNumber: data.aadhaar,
        ration_no: data.ration_no ? parseInt(data.ration_no) : undefined,
        employmentType: data.employmentType,
        isFarmer: data.isFarmer,
        kccLimit: data.kccLimit,
        role: 'worker' as UserRole,
      });
      setStep('otp');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Registration failed. Please try again.');
    }
  };

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Check your email</h2>
          <p className="mt-2 text-gray-600">
            We've sent a verification code to your email address. Please check your inbox and enter
            the code below.
          </p>
        </div>

        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <input
              key={i}
              type="text"
              maxLength={1}
              className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
            />
          ))}
        </div>

        <Button className="w-full" size="lg">
          Verify Email
        </Button>

        <p className="text-center text-sm text-gray-600">
          Didn't receive the code?{' '}
          <button className="font-medium text-primary-600 hover:text-primary-500">Resend</button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center lg:text-left">
        <h2 className="text-2xl font-bold text-gray-900">Create an account</h2>
        <p className="mt-2 text-gray-600">Fill in your details to get started</p>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          placeholder="Enter your full name"
          leftIcon={<User className="h-5 w-5" />}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          leftIcon={<Mail className="h-5 w-5" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Phone Number"
          type="tel"
          placeholder="Enter your phone number"
          leftIcon={<Phone className="h-5 w-5" />}
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Input
          label="Aadhaar Number"
          placeholder="Enter 12-digit Aadhaar number"
          leftIcon={<CreditCard className="h-5 w-5" />}
          error={errors.aadhaar?.message}
          maxLength={12}
          {...register('aadhaar')}
        />

        <Input
          label="Ration Card Number"
          placeholder="Enter 12-digit ration card number (e.g., 123456789012)"
          leftIcon={<CreditCard className="h-5 w-5" />}
          error={errors.ration_no?.message}
          maxLength={12}
          {...register('ration_no')}
        />

        {/* Employment Type */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Employment Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setEmploymentType('formal');
                setValue('employmentType', 'formal');
                setIsFarmer(false);
                setValue('isFarmer', false);
              }}
              className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                watchEmploymentType === 'formal'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              Formal Job
            </button>
            <button
              type="button"
              onClick={() => {
                setEmploymentType('informal');
                setValue('employmentType', 'informal');
              }}
              className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                watchEmploymentType === 'informal'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              Informal Job
            </button>
          </div>
          {errors.employmentType && (
            <p className="text-sm text-red-600">{errors.employmentType.message}</p>
          )}
        </div>

        {/* Farmer Status - Only show if informal */}
        {watchEmploymentType === 'informal' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Are you a farmer?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFarmer(true);
                  setValue('isFarmer', true);
                }}
                className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                  watchIsFarmer === true
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                Yes, I am a farmer
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFarmer(false);
                  setValue('isFarmer', false);
                  setValue('kccLimit', undefined);
                }}
                className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                  watchIsFarmer === false
                    ? 'border-gray-500 bg-gray-50 text-gray-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* KCC Limit - Only show if farmer */}
        {watchEmploymentType === 'informal' && watchIsFarmer && (
          <Input
            label="Kisan Credit Card (KCC) Limit (Optional)"
            type="number"
            placeholder="Enter KCC limit amount"
            leftIcon={<CreditCard className="h-5 w-5" />}
            error={errors.kccLimit?.message}
            {...register('kccLimit', { valueAsNumber: true })}
          />
        )}

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Create a password"
          leftIcon={<Lock className="h-5 w-5" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="focus:outline-none"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          }
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirm Password"
          type={showConfirmPassword ? 'text' : 'password'}
          placeholder="Confirm your password"
          leftIcon={<Lock className="h-5 w-5" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="focus:outline-none"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          }
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="flex items-start">
          <input
            type="checkbox"
            id="terms-user"
            className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            {...register('termsAccepted')}
          />
          <label htmlFor="terms-user" className="ml-2 text-sm text-gray-600">
            I agree to the{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-primary-600 hover:text-primary-500"
            >
              Terms of Service
            </button>{' '}
            and{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-primary-600 hover:text-primary-500"
            >
              Privacy Policy
            </button>
          </label>
        </div>
        {errors.termsAccepted && (
          <p className="text-sm text-red-600">{errors.termsAccepted.message}</p>
        )}

        <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
          Create Account
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </form>

      <p className="text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link to={ROUTES.LOGIN} className="font-medium text-primary-600 hover:text-primary-500">
          Sign in
        </Link>
      </p>

      <p className="text-center text-xs text-gray-500">
        Government and Admin accounts are created by system administrators.
      </p>

      <Modal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms of Service"
        size="full"
      >
        <div className="space-y-5 text-gray-700">
          <section>
            <h3 className="text-lg font-semibold text-gray-900">1. Overview</h3>
            <p className="mt-2">
              TRACIENT provides a secure platform for recording wage payments, verifying worker
              identities, and supporting welfare distribution with blockchain-backed records. By
              using the service, you agree to these Terms.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">2. Eligibility</h3>
            <p className="mt-2">
              You must provide accurate registration details. Employers and workers must be
              authorized to use the platform. Government and admin accounts are provisioned by
              system administrators.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">3. Acceptable Use</h3>
            <p className="mt-2">
              You agree not to misuse the service, attempt unauthorized access, or submit false
              wage or identity information. Abuse may lead to account suspension.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">4. Data Integrity</h3>
            <p className="mt-2">
              Wage entries and related records may be stored on an immutable ledger. You are
              responsible for verifying details before submission.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">5. Availability</h3>
            <p className="mt-2">
              We strive for high availability, but service interruptions may occur due to
              maintenance or network issues. TRACIENT is not liable for indirect damages.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">6. Contact</h3>
            <p className="mt-2">
              For support, contact your system administrator or program office.
            </p>
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title="Privacy Policy"
        size="full"
      >
        <div className="space-y-5 text-gray-700">
          <section>
            <h3 className="text-lg font-semibold text-gray-900">1. Information We Collect</h3>
            <p className="mt-2">
              We collect identity and contact data needed to manage wage records, including name,
              phone number, email, and government identifiers. Employers may submit worker payment
              details.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">2. How We Use Data</h3>
            <p className="mt-2">
              Data is used to verify identities, record payments, detect anomalies, and support
              program reporting. Blockchain records are immutable once submitted.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">3. Sharing</h3>
            <p className="mt-2">
              We share data only with authorized government or program administrators and only for
              legitimate operational or compliance purposes.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">4. Security</h3>
            <p className="mt-2">
              We use access controls, audit logs, and encryption where applicable. Users should
              keep their credentials secure and report suspicious activity.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-900">5. Your Choices</h3>
            <p className="mt-2">
              You can review and update your profile details. Some ledger entries cannot be
              altered once recorded.
            </p>
          </section>
        </div>
      </Modal>
    </div>
  );
};

export default RegisterForm;
