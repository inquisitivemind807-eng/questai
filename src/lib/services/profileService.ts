import { authService } from '../authService.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

class ProfileService {
  async getHeaders() {
    let token = await authService.getAccessToken();
    
    if (token && !token.startsWith('eyJ')) {
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

  async getProfiles() {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/profiles`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get profiles');
    }

    const data = await response.json();
    return data.data;
  }

  async getProfile(id: string) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get profile');
    }

    const data = await response.json();
    return data.data;
  }

  async createProfile(profileName: string) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/profiles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profileName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create profile');
    }

    const data = await response.json();
    return data.data;
  }

  async updateProfile(id: string, updates: any) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update profile');
    }

    const data = await response.json();
    return data.data;
  }

  async deleteProfile(id: string) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete profile');
    }

    const data = await response.json();
    return data.success;
  }
}

export const profileService = new ProfileService();
