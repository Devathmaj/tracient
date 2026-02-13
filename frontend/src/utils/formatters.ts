import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

// Currency formatter for INR
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Format large numbers in Indian system (lakhs, crores)
export const formatIndianNumber = (num: number): string => {
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `${(num / 100000).toFixed(2)} L`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)} K`;
  }
  return num.toFixed(2);
};

// Format compact number
export const formatCompactNumber = (num: number): string => {
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(num);
};

// Date formatters
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'dd MMM yyyy');
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'dd MMM yyyy, hh:mm a');
};

export const formatRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return formatDistanceToNow(d, { addSuffix: true });
};

export const formatShortDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'dd/MM/yyyy');
};

export const formatMonthYear = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'MMM yyyy');
};

// Percentage formatter
export const formatPercentage = (value: number, decimals = 1): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

// Phone number formatter (Indian)
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

// Mask Aadhaar (show only last 4 digits)
export const maskAadhaar = (aadhaar: string): string => {
  if (aadhaar.length < 4) return aadhaar;
  return `XXXX XXXX ${aadhaar.slice(-4)}`;
};

// Mask Phone number (show only last 4 digits)
export const maskPhone = (phone: string): string => {
  if (phone.length < 4) return phone;
  return `XXXXXX${phone.slice(-4)}`;
};

// Mask PAN (show only last 4 characters)
export const maskPAN = (pan: string): string => {
  if (pan.length < 4) return pan;
  return `XXXXXX${pan.slice(-4)}`;
};

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Format duration in seconds to readable
export const formatDuration = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// Format uptime percentage
export const formatUptime = (uptime: number): string => {
  return `${(uptime * 100).toFixed(2)}%`;
};

// Format number with locale
export const formatNumber = (num: number): string => {
  return num.toLocaleString('en-IN');
};

/**
 * Format Aadhaar number with spaces for better readability
 * @param value - The Aadhaar number string
 * @returns Formatted Aadhaar number (XXXX XXXX XXXX)
 */
export const formatAadhaar = (value: string): string => {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Limit to 12 digits
  const limitedDigits = digits.slice(0, 12);
  
  // Add spaces every 4 digits
  return limitedDigits.replace(/(\d{4})(?=\d)/g, '$1 ');
};

/**
 * Format phone number for display
 * @param value - The phone number string
 * @returns Formatted phone number
 */
export const formatPhoneNumber = (value: string): string => {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Limit to 10 digits for Indian phone numbers
  const limitedDigits = digits.slice(0, 10);
  
  // Format as XXXXX XXXXX
  if (limitedDigits.length > 5) {
    return limitedDigits.slice(0, 5) + ' ' + limitedDigits.slice(5);
  }
  
  return limitedDigits;
};

/**
 * Format PAN number for display
 * @param value - The PAN number string
 * @returns Formatted PAN number
 */
export const formatPAN = (value: string): string => {
  // Convert to uppercase and remove invalid characters
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Limit to 10 characters
  return cleaned.slice(0, 10);
};

/**
 * Format ration card number for display
 * @param value - The ration card number string
 * @returns Formatted ration card number
 */
export const formatRationCard = (value: string): string => {
  // Convert to uppercase and remove invalid characters
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Limit to 15 characters
  return cleaned.slice(0, 15);
};

/**
 * Validate and format Indian names
 * @param value - The name string
 * @returns Cleaned name with proper spacing
 */
export const formatName = (value: string): string => {
  // Remove extra spaces and trim
  return value
    .replace(/[^a-zA-Z ]/g, '') // Only letters and spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
};

/**
 * Validate Indian mobile number
 * @param phone - Phone number string
 * @returns boolean indicating if valid
 */
export const isValidIndianMobile = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(cleaned);
};

/**
 * Validate Aadhaar checksum using Verhoeff algorithm
 * @param aadhaar - Aadhaar number string
 * @returns boolean indicating if valid
 */
export const validateAadhaarChecksum = (aadhaar: string): boolean => {
  const cleaned = aadhaar.replace(/\D/g, '');
  if (cleaned.length !== 12) return false;
  
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
  
  let c = 0;
  const digits = cleaned.split('').map(Number).reverse();
  
  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[i % 8][digits[i]]];
  }
  
  return c === 0;
};
