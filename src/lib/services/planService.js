/**
 * Plan Service - Frontend API client for subscription plans
 */
import { authService } from '../authService.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

class PlanService {
  /**
   * Get authentication headers with JWT token
   */
  async getHeaders() {
    // Get session token first
    let token = await authService.getAccessToken();
    
    // If we have a session token, we need to convert it to JWT
    // The backend checkout endpoint requires JWT tokens
    if (token) {
      // Check if it's already a JWT (starts with eyJ)
      if (token.startsWith('eyJ')) {
        // Already a JWT token
        return {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
      } else {
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
   * Get all available plans (public endpoint)
   */
  async getPlans() {
    const response = await fetch(`${API_BASE}/api/plans`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get plans');
    }

    const data = await response.json();
    return data.data.plans;
  }

  /**
   * Create checkout session
   */
  async createCheckout(planId, successUrl, cancelUrl) {
    const headers = await this.getHeaders();
    
    console.log('Creating checkout with:', { planId, successUrl, cancelUrl, API_BASE });
    
    const response = await fetch(`${API_BASE}/api/plans/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        planId,
        successUrl,
        cancelUrl
      })
    });

    const responseData = await response.json();
    console.log('Checkout response status:', response.status);
    console.log('Checkout response data:', responseData);

    if (!response.ok) {
      const errorMessage = responseData.error || responseData.message || `HTTP ${response.status}: Failed to create checkout session`;
      throw new Error(errorMessage);
    }

    if (!responseData.success) {
      throw new Error(responseData.error || 'Failed to create checkout session');
    }

    if (!responseData.data || !responseData.data.url) {
      throw new Error('Invalid checkout response: missing checkout URL');
    }

    return responseData.data;
  }
}

export const planService = new PlanService();
