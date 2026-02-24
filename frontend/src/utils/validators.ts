import { z } from 'zod';

// Aadhaar validation (12 digits)
export const aadhaarSchema = z
  .string()
  .length(12, 'Aadhaar must be 12 digits')
  .regex(/^\d{12}$/, 'Aadhaar must contain only digits');

// PAN validation (AAAAA0000A format)
export const panSchema = z
  .string()
  .length(10, 'PAN must be 10 characters')
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format');

// GSTIN validation (15 characters)
export const gstinSchema = z
  .string()
  .length(15, 'GSTIN must be 15 characters')
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format');

// Phone validation (Indian 10 digits)
export const phoneSchema = z
  .string()
  .length(10, 'Phone number must be 10 digits')
  .regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number');

// Ration card validation (12 digits, optional)
export const rationSchema = z
  .string()
  .length(12, 'Ration card number must be 12 digits')
  .regex(/^\d{12}$/, 'Ration card must contain only digits')
  .optional()
  .or(z.literal(''));

// Email validation
export const emailSchema = z.string().email('Invalid email address');

// Name validation (alphabets only, each word must start with a capital letter)
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .regex(/^[A-Za-z]+(\s[A-Za-z]+)*$/, 'Name must contain only alphabets')
  .regex(/^([A-Z][a-z]*(\s|$))+$/, 'Each word must start with a capital letter (e.g. John Doe)');

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Amount validation
export const amountSchema = z
  .number()
  .positive('Amount must be positive')
  .max(10000000, 'Amount cannot exceed ₹1 crore');

// OTP validation
export const otpSchema = z
  .string()
  .length(6, 'OTP must be 6 digits')
  .regex(/^\d{6}$/, 'OTP must contain only digits');

// Login form schema
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

// Worker registration schema
export const workerRegistrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  aadhaar: aadhaarSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  ration_no: rationSchema,
  employmentType: z.enum(['formal', 'informal'], {
    errorMap: () => ({ message: 'Please select employment type' })
  }),
  isFarmer: z.boolean().optional(),
  kccLimit: z.number().min(0, 'KCC limit must be positive').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine((data) => {
  // If farmer, KCC limit can be provided but not required
  if (data.isFarmer && data.kccLimit && data.kccLimit < 0) {
    return false;
  }
  return true;
}, {
  message: 'Invalid KCC limit',
  path: ['kccLimit'],
});

// Employer registration schema
export const employerRegistrationSchema = z.object({
  name: nameSchema,
  businessName: z.string().min(2, 'Business name is required'),
  email: emailSchema,
  phone: phoneSchema,
  pan: panSchema,
  gstin: gstinSchema.optional(),
  password: passwordSchema,
  confirmPassword: z.string(),
  ration_no: rationSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Wage record form schema
export const wageRecordSchema = z.object({
  workerID: z.string().min(1, 'Worker is required').optional(),
  amount: amountSchema,
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.enum(['bank_transfer', 'upi', 'cash', 'cheque'], {
    errorMap: () => ({ message: 'Please select a payment method' })
  }),
  workType: z.enum(['daily_wage', 'weekly', 'monthly', 'contract', 'overtime', 'bonus'], {
    errorMap: () => ({ message: 'Please select a work type' })
  }),
  hoursWorked: z.number().optional(),
  reference: z.string().optional(),
  description: z.string().optional(),
});

// Policy config schema
export const policyConfigSchema = z.object({
  bplThreshold: z.number().min(0, 'Threshold must be positive').max(500000, 'Threshold too high'),
  aplThreshold: z.number().min(0, 'Threshold must be positive'),
  effectiveDate: z.string().min(1, 'Effective date is required'),
}).refine((data) => data.aplThreshold > data.bplThreshold, {
  message: 'APL threshold must be greater than BPL threshold',
  path: ['aplThreshold'],
});

// Bulk upload validation
export const bulkWageRowSchema = z.object({
  workerID: z.string().min(1),
  amount: z.number().positive(),
  jobType: z.string(),
  date: z.string(),
});

// Type exports
export type LoginFormData = z.infer<typeof loginSchema>;
export type WorkerRegistrationFormData = z.infer<typeof workerRegistrationSchema>;
export type EmployerRegistrationFormData = z.infer<typeof employerRegistrationSchema>;
export type WageRecordFormData = z.infer<typeof wageRecordSchema>;
export type PolicyConfigFormData = z.infer<typeof policyConfigSchema>;

// Export aliases for backward compatibility
export { workerRegistrationSchema as registerWorkerSchema };
export { employerRegistrationSchema as registerEmployerSchema };
