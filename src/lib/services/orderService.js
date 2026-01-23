/**
 * Order Service - Frontend API client for order management
 */
import { authService } from '../authService.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

class OrderService {
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
   * Get user orders
   */
  async getOrders(options = {}) {
    const { page = 1, limit = 10, status } = options;
    const headers = await this.getHeaders();
    
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (status) {
      params.append('status', status);
    }

    const response = await fetch(`${API_BASE}/api/orders?${params}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get orders');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get order details
   */
  async getOrder(orderId) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/orders/${orderId}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get order');
    }

    const data = await response.json();
    return data.data.order;
  }
}

export const orderService = new OrderService();
