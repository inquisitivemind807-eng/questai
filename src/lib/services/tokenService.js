/**
 * Token Service - Frontend API client for token management
 */
import { API_CONFIG } from '../api-config.js';
import { authService } from '../authService.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

class TokenService {
  /**
   * Get authentication headers with JWT token
   */
  async getHeaders() {
    // Get session token first
    let token = await authService.getAccessToken();
    
    // If we have a session token, we need to convert it to JWT
    if (token && !token.startsWith('eyJ')) {
      // It's a session token, convert to JWT
      try {
        const response = await fetch(`${API_BASE}/api/auth/session-to-jwt`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.accessToken) {
            token = data.accessToken;
          }
        }
      } catch (error) {
        console.error('Failed to convert session to JWT:', error);
      }
    }

    if (!token) {
      throw new Error('Not authenticated. Please login first.');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get user token balance
   */
  async getBalance() {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/tokens/balance`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get token balance');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get token transaction history
   */
  async getTransactions(options = {}) {
    const { page = 1, limit = 20, type } = options;
    const headers = await this.getHeaders();
    
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (type) {
      params.append('type', type);
    }

    const response = await fetch(`${API_BASE}/api/tokens/transactions?${params}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get transactions');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Check if user has enough tokens
   */
  async checkTokens(requiredTokens) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/tokens/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requiredTokens })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to check tokens');
    }

    const data = await response.json();
    return data.data;
  }
}

export const tokenService = new TokenService();
