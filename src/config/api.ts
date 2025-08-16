//API Configuration for DevHubConnect
// This centralizes all API URLs and handles environment switching

const isDevelopment = import.meta.env.DEV;
const productionBaseUrl = 'https://devhubconnect-production.up.railway.app';
const developmentBaseUrl = 'http://localhost:3000';

// Use environment variable if available, otherwise fallback to environment detection
export const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (isDevelopment ? developmentBaseUrl : productionBaseUrl);

// API endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH_SESSION: `${API_BASE_URL}/api/auth/profile/session`,
  AUTH_LOGOUT: `${API_BASE_URL}/api/auth/logout`,
  AUTH_GITHUB: `${API_BASE_URL}/api/auth/github`,
  AUTH_ADMIN_LOGIN: `${API_BASE_URL}/api/auth/admin/login`,
  
  // Template endpoints
  TEMPLATES: `${API_BASE_URL}/api/templates`,
  TEMPLATE_BY_ID: (id: string) => `${API_BASE_URL}/api/templates/${id}`,
  ASK_AI: `${API_BASE_URL}/api/ask-ai`,
  RECOMMENDATIONS: `${API_BASE_URL}/api/recommendations`,
  
  // Purchase endpoints
  PURCHASES: `${API_BASE_URL}/api/user/purchases`,
  
  // Stripe endpoints
  CREATE_CHECKOUT: `${API_BASE_URL}/api/stripe/create-checkout-session`,
};

// Helper function for making API calls with consistent options
export const apiCall = async (url: string, options: RequestInit = {}) => {
  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  return fetch(url, { ...defaultOptions, ...options });
};

console.log('🔗 API Base URL:', API_BASE_URL);