import { z } from 'zod';

// Aadhaar validation with enhanced Indian criteria
export const aadhaarSchema = z
  .string()
  .min(12, 'Aadhaar number is required')
  .transform((val) => val.replace(/\s/g, ''))
  .refine((val) => val.length === 12, 'Aadhaar must be exactly 12 digits')
  .refine((val) => /^\d{12}$/.test(val), 'Aadhaar must contain only digits')
  .refine((val) => !val.startsWith('0') && !val.startsWith('1'), 'Invalid Aadhaar number format')
  .refine((val) => !val.split('').every((digit) => digit === val[0]), 'Aadhaar cannot have all identical digits');

// PAN validation
export const panSchema = z
  .string()
  .length(10, 'PAN must be 10 characters')
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format');

// GSTIN validation
export const gstinSchema = z
  .string()
  .length(15, 'GSTIN must be 15 characters')
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format');

// Phone validation
export const phoneSchema = z
  .string()
  .length(10, 'Phone number must be 10 digits')
  .regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number');

// Ration card validation
export const rationSchema = z
  .string()
  .transform((val) => val.replace(/\s/g, ''))
  .refine((val) => val.length === 12, 'Ration card number must be exactly 12 digits')
  .refine((val) => /^\d{12}$/.test(val), 'Ration card number must contain only digits');

// Email validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email address')
  .refine((email) => {
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return false;
    if (localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) return false;
    if (domain.length > 253 || domain.startsWith('-') || domain.endsWith('-')) return false;
    return true;
  }, 'Please enter a valid email address');

// ✅ FIXED: Single unified name schema
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name cannot exceed 50 characters')
  .regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/, 'Name must contain only alphabets and single spaces')
  .regex(/^([A-Z][a-z]*(\s|$))+$/, 'Each word must start with a capital letter (e.g. John Doe)')
  .refine((name) => !name.includes('  '), 'No multiple consecutive spaces allowed');

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

// Login form
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

// Worker registration
export const workerRegistrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  aadhaar: aadhaarSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  ration_no: rationSchema,
  employmentType: z.enum(['formal', 'informal']),
  isFarmer: z.boolean().optional(),
  kccLimit: z.number().min(0).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Employer registration
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

// Wage record
export const wageRecordSchema = z.object({
  workerID: z.string().min(1).optional(),
  amount: amountSchema,
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(['bank_transfer', 'upi', 'cash', 'cheque']),
  workType: z.enum(['daily_wage', 'weekly', 'monthly', 'contract', 'overtime', 'bonus']),
  hoursWorked: z.number().optional(),
  reference: z.string().optional(),
  description: z.string().optional(),
});

// Policy config
export const policyConfigSchema = z.object({
  bplThreshold: z.number().min(0).max(500000),
  aplThreshold: z.number().min(0),
  effectiveDate: z.string().min(1),
}).refine((data) => data.aplThreshold > data.bplThreshold, {
  message: 'APL threshold must be greater than BPL threshold',
  path: ['aplThreshold'],
});

// Bulk upload
export const bulkWageRowSchema = z.object({
  workerID: z.string().min(1),
  amount: z.number().positive(),
  jobType: z.string(),
  date: z.string(),
});

// Types
export type LoginFormData = z.infer<typeof loginSchema>;
export type WorkerRegistrationFormData = z.infer<typeof workerRegistrationSchema>;
export type EmployerRegistrationFormData = z.infer<typeof employerRegistrationSchema>;
export type WageRecordFormData = z.infer<typeof wageRecordSchema>;
export type PolicyConfigFormData = z.infer<typeof policyConfigSchema>;

// Aliases
export { workerRegistrationSchema as registerWorkerSchema };
export { employerRegistrationSchema as registerEmployerSchema };