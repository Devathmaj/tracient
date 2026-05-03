// App constants
export const APP_NAME = 'TRACIENT';
export const APP_FULL_NAME = 'Transparent Citizen Income Enablement Tracker';
export const APP_DESCRIPTION = 'Blockchain-based Income Traceability System for Equitable Welfare Distribution';

// API
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const BLOCKCHAIN_EXPLORER_URL = import.meta.env.VITE_BLOCKCHAIN_EXPLORER_URL || 'http://localhost:8080';

// Auth
export const TOKEN_KEY = 'authToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
export const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// BPL/APL Thresholds (can be overridden by policy)
export const DEFAULT_BPL_THRESHOLD = 100000; // ₹1 lakh annual income
export const DEFAULT_APL_THRESHOLD = 500000; // ₹5 lakh annual income
export const BPL_THRESHOLD = DEFAULT_BPL_THRESHOLD; // Alias for backward compatibility

// Currency
export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  VERIFY_OTP: '/verify-otp',
  UNAUTHORIZED: '/unauthorized',
  NOT_FOUND: '/404',
  
  // Worker routes
  WORKER_DASHBOARD: '/worker/dashboard',
  WORKER_WAGES: '/worker/wages',
  WORKER_PROFILE: '/worker/profile',
  
  // Employer routes
  EMPLOYER_DASHBOARD: '/employer/dashboard',
  EMPLOYER_RECORD_WAGE: '/employer/record-wage',
  EMPLOYER_BULK_UPLOAD: '/employer/bulk-upload',
  EMPLOYER_WORKERS: '/employer/workers',
  EMPLOYER_PAYMENTS: '/employer/payments',
  
  // Government routes
  GOV_DASHBOARD: '/government/dashboard',
  GOVERNMENT_DASHBOARD: '/government/dashboard', // Alias
  GOV_ANALYTICS: '/government/analytics',
  GOV_SECTORS: '/government/sectors',
  GOV_GEOGRAPHIC: '/government/geographic',
  GOV_ANOMALIES: '/government/anomalies',
  GOV_POLICY: '/government/policy',
  GOV_AUDIT: '/government/audit',
  
  // Admin routes
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_USERS: '/admin/users',
  ADMIN_IDENTITY: '/admin/identity',
  ADMIN_ORGANIZATIONS: '/admin/organizations',
  ADMIN_SYSTEM: '/admin/system',
  ADMIN_LOGS: '/admin/logs',
} as const;

// Role labels
export const ROLE_LABELS: Record<string, string> = {
  worker: 'User',
  employer: 'Employer',
  government: 'Government Official',
  admin: 'System Administrator',
};

// Status colors
export const STATUS_COLORS = {
  active: 'success',
  inactive: 'gray',
  pending: 'warning',
  suspended: 'error',
  running: 'success',
  stopped: 'error',
  error: 'error',
  healthy: 'success',
  degraded: 'warning',
  down: 'error',
  connected: 'success',
  disconnected: 'error',
  verified: 'success',
  new: 'primary',
  investigating: 'warning',
  resolved: 'success',
} as const;

// Severity colors
export const SEVERITY_COLORS = {
  low: 'blue',
  medium: 'yellow',
  high: 'red',
} as const;

// Chart colors
export const CHART_COLORS = {
  primary: '#0ea5e9',
  accent: '#f59e0b',
  success: '#10b981',
  error: '#ef4444',
  violet: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
  lime: '#84cc16',
  // Array for iteration
  array: [
    '#0ea5e9', // primary-500
    '#f59e0b', // accent-500
    '#10b981', // success-500
    '#ef4444', // error-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#84cc16', // lime-500
  ],
};

// Sector colors for charts
export const SECTOR_COLORS: Record<string, string> = {
  construction: '#f59e0b',
  agriculture: '#10b981',
  retail: '#8b5cf6',
  manufacturing: '#06b6d4',
  domestic: '#ec4899',
  transport: '#ef4444',
  hospitality: '#84cc16',
  other: '#6b7280',
};

// Welfare schemes
export const WELFARE_SCHEMES = [
  'PM-KISAN',
  'MGNREGA',
  'Ayushman Bharat',
  'PM Awas Yojana',
  'Ration Card (BPL)',
  'Scholarship Schemes',
  'Housing Subsidy',
  'Free Education',
];

// States of India for geographic data
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry',
];
