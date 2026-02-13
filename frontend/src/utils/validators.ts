import { z } from 'zod';

// Aadhaar validation with enhanced Indian criteria
export const aadhaarSchema = z
  .string()
  .min(12, 'Aadhaar number is required')
  .transform((val) => val.replace(/\s/g, '')) // Remove spaces
  .refine((val) => val.length === 12, 'Aadhaar must be exactly 12 digits')
  .refine((val) => /^\d{12}$/.test(val), 'Aadhaar must contain only digits')
  .refine((val) => {
    // Basic validation - first digit cannot be 0 or 1
    return !val.startsWith('0') && !val.startsWith('1');
  }, 'Invalid Aadhaar number format')
  .refine((val) => {
    // Check for repeated digits (like 000000000000 or 111111111111)
    return !val.split('').every((digit, index, arr) => digit === arr[0]);
  }, 'Aadhaar cannot have all identical digits')
  .refine((val) => {
    // Verhoeff algorithm check for Aadhaar validation
    const d = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    ];
    const p = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
    ];
    const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
    
    let c = 0;
    const digits = val.split('').map(Number).reverse();
    
    for (let i = 0; i < digits.length; i++) {
      c = d[c][p[i % 8][digits[i]]];
    }
    
    return c === 0;
  }, 'Invalid Aadhaar number - checksum verification failed');

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

// Ration card validation with Indian standards (10-15 alphanumeric characters)
export const rationSchema = z
  .string()
  .transform((val) => val.replace(/\s/g, '').toUpperCase()) // Remove spaces and convert to uppercase
  .refine((val) => {
    if (val === '') return true; // Optional field
    return val.length >= 10 && val.length <= 15;
  }, 'Ration card number must be 10-15 characters')
  .refine((val) => {
    if (val === '') return true; // Optional field
    return /^[A-Z0-9]+$/.test(val);
  }, 'Ration card number can only contain letters and numbers')
  .refine((val) => {
    if (val === '') return true; // Optional field
    // Should start with state code (2 letters) followed by numbers/letters
    return /^[A-Z]{2}[A-Z0-9]+$/.test(val);
  }, 'Ration card number should start with 2-letter state code')
  .optional()
  .or(z.literal(''));

// Enhanced email validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email address')
  .refine((email) => {
    // Additional checks for email format
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [localPart, domain] = parts;
    
    // Local part validation
    if (localPart.length > 64) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;
    
    // Domain validation
    if (domain.length > 253) return false;
    if (domain.startsWith('-') || domain.endsWith('-')) return false;
    
    return true;
  }, 'Please enter a valid email address');

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

// Name validation - only characters and single spaces between words
export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name cannot exceed 50 characters')
  .regex(/^[a-zA-Z]+(?: [a-zA-Z]+)*$/, 'Name can only contain letters and single spaces between words')
  .refine((name) => {
    // Ensure no leading/trailing spaces and no multiple consecutive spaces
    return name.trim() === name && !name.includes('  ');
  }, 'Name cannot have leading/trailing spaces or multiple consecutive spaces');

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
