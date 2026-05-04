import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/utils/constants';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Public endpoints that should NOT include auth headers
const PUBLIC_ENDPOINTS = [
  'workers/qr/verify',
  'workers/qr/deposit'
];

const AUTH_ENDPOINTS = [
  'auth/login',
  'auth/register',
  'auth/refresh-token',
  'auth/forgot-password',
  'auth/reset-password'
];

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Check if this is a public endpoint that should not have auth headers
    const url = config.url || '';
    const isPublicEndpoint = PUBLIC_ENDPOINTS.some(endpoint => 
      url.includes(endpoint)
    );
    
    // Only add Authorization header for non-public endpoints
    if (!isPublicEndpoint) {
      const token = localStorage.getItem('accessToken');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    const requestUrl = error.config?.url || '';
    
    // Check if this was a request to a public endpoint
    const isPublicEndpoint = PUBLIC_ENDPOINTS.some(endpoint => 
      requestUrl.includes(endpoint)
    );

    const isAuthEndpoint = AUTH_ENDPOINTS.some(endpoint =>
      requestUrl.includes(endpoint)
    );
    
    if (error.response?.status === 401) {
      // Only redirect to login if this is NOT a public endpoint
      if (!isPublicEndpoint && !isAuthEndpoint) {
        // Token expired or invalid - remove all auth tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      // For public endpoints, just let the error propagate without redirect
    }
    
    if (error.response?.status === 403) {
      // Forbidden - redirect to unauthorized (only for non-public endpoints)
      if (!isPublicEndpoint && !isAuthEndpoint) {
        window.location.href = '/unauthorized';
      }
    }

    // Extract error message
    const message = 
      (error.response?.data as { message?: string })?.message ||
      error.message ||
      'An unexpected error occurred';

    return Promise.reject(new Error(message));
  }
);

export default api;

// Helper functions for common HTTP methods
export const get = <T>(url: string, params?: object): Promise<T> => {
  return api.get(url, { params });
};

export const post = <T>(url: string, data?: unknown): Promise<T> => {
  return api.post(url, data);
};

export const put = <T>(url: string, data?: unknown): Promise<T> => {
  return api.put(url, data);
};

export const patch = <T>(url: string, data?: unknown): Promise<T> => {
  return api.patch(url, data);
};

export const del = <T>(url: string): Promise<T> => {
  return api.delete(url);
};

// Form data upload
export const uploadFile = <T>(url: string, formData: FormData): Promise<T> => {
  return api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};
