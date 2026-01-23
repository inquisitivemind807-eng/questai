/**
 * Centralized API configuration
 * Change BASE_URL for different deployment environments
 */

// Determine base URL based on environment
function getBaseUrl() {
  // Check if we're in browser environment
  if (typeof window !== 'undefined' && window.location) {
    // In browser, use current origin
    return window.location.origin;
  }

  // In server-side/Node.js, use environment variable or default
  // For production, set API_BASE_URL environment variable
  return process.env.API_BASE_URL || 'http://localhost:1420';
}

export const API_CONFIG = {
  // Base URL - change this for deployment
  BASE_URL: getBaseUrl(),

  // API endpoints (matches API.md documentation)
  ENDPOINTS: {
    // Session & Auth
    SESSION: '/api/session',
    AUTH_ME: '/api/auth/me',
    AUTH_KEYS: '/api/auth/keys',
    AUTH_TEST_KEY: '/api/auth/test-key',

    // AI Generation APIs
    COVER_LETTER: '/api/cover_letter',
    RESUME: '/api/resume',
    QUESTION_ANSWERS: '/api/questionAndAnswers',
    GENERATE: '/api/generate',

    // RAG APIs
    RAG_QUERY: '/api/rag/query',
    RAG_IMPORT: '/api/rag/import',

    // File Management
    FILES: '/api/files',
    STORAGE_LIST: '/api/storage/list',
    STORAGE_UPLOAD: '/api/storage/upload',

    // Corpus Management
    CORPUS: '/api/corpus',
    CORPUS_FILES: '/api/corpus/files',

    // Generic Questions (specific to this app)
    GENERIC_QUESTIONS: '/api/generic-questions',
    GENERIC_QUESTIONS_STATS: '/api/generic-questions/stats',

    // System
    SYSTEM_STATUS: '/api/system/status',
    SYSTEM_STATS: '/api/system/stats',

    // Token Management
    TOKENS_BALANCE: '/api/tokens/balance',
    TOKENS_TRANSACTIONS: '/api/tokens/transactions',
    TOKENS_CHECK: '/api/tokens/check',

    // Plans & E-Commerce
    PLANS: '/api/plans',
    PLANS_CHECKOUT: '/api/plans/checkout',

    // Orders
    ORDERS: '/api/orders',
    ORDER_DETAILS: '/api/orders' // Use with orderId
  },

  // External APIs
  EXTERNAL: {
    // Add external API endpoints here if needed
  }
};

/**
 * Helper function to get full API URL
 * @param {string} endpoint - The endpoint key from API_CONFIG.ENDPOINTS
 * @returns {string} - Full URL
 */
export function getApiUrl(endpoint) {
  if (!API_CONFIG.ENDPOINTS[endpoint]) {
    throw new Error(`Unknown API endpoint: ${endpoint}. Available: ${Object.keys(API_CONFIG.ENDPOINTS).join(', ')}`);
  }
  return `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS[endpoint]}`;
}

/**
 * Helper function to get external API URL
 * @param {string} service - The service key from API_CONFIG.EXTERNAL
 * @returns {string} - Full URL
 */
export function getExternalApiUrl(service) {
  if (!API_CONFIG.EXTERNAL[service]) {
    throw new Error(`Unknown external API service: ${service}. Available: ${Object.keys(API_CONFIG.EXTERNAL).join(', ')}`);
  }
  return API_CONFIG.EXTERNAL[service];
}

/**
 * Create authenticated fetch headers
 * @param {string} apiKey - Bearer token
 * @returns {object} - Headers object
 */
export function createAuthHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * Pre-built API URLs for common use
 */
export const API_URLS = {
  SESSION: () => getApiUrl('SESSION'),
  COVER_LETTER: () => getApiUrl('COVER_LETTER'),
  RESUME: () => getApiUrl('RESUME'),
  QUESTION_ANSWERS: () => getApiUrl('QUESTION_ANSWERS'),
  GENERIC_QUESTIONS: () => getApiUrl('GENERIC_QUESTIONS'),
  GENERIC_QUESTIONS_STATS: () => getApiUrl('GENERIC_QUESTIONS_STATS'),
  AUTH_ME: () => getApiUrl('AUTH_ME'),
  SYSTEM_STATUS: () => getApiUrl('SYSTEM_STATUS')
};

/**
 * API Client helper class for consistent requests
 */
export class ApiClient {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = API_CONFIG.BASE_URL;
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - Endpoint key from API_CONFIG.ENDPOINTS
   * @param {object} options - Fetch options
   * @returns {Promise<object>} - API response
   */
  async request(endpoint, options = {}) {
    const url = getApiUrl(endpoint);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const config = {
      ...options,
      headers
    };

    const response = await fetch(url, config);
    return await response.json();
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}