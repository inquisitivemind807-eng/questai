import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { API_URLS } from './api-config.js';

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    token: null,
    isLoggedIn: false,
    loading: false,
    session: null
  });

  return {
    subscribe,
    // Traditional email/password login (keep for compatibility)
    login: async (email, password) => {
      update(state => ({ ...state, loading: true }));

      try {
        const response = await fetch(`${API_URLS.AUTH_ME().replace('/me', '')}?endpoint=login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
          if (browser) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
          }

          set({
            user: data.user,
            token: data.token,
            isLoggedIn: true,
            loading: false,
            session: null
          });

          return { success: true, data };
        } else {
          update(state => ({ ...state, loading: false }));
          return { success: false, error: data.message || 'Login failed' };
        }
      } catch (error) {
        update(state => ({ ...state, loading: false }));
        return { success: false, error: 'Network error. Please try again.' };
      }
    },


    // Update session from page data
    updateSession: (session) => {
      if (session?.user) {
        set({
          user: session.user,
          token: session.accessToken || null,
          isLoggedIn: true,
          loading: false,
          session: session
        });
      } else {
        set({
          user: null,
          token: null,
          isLoggedIn: false,
          loading: false,
          session: null
        });
      }
    },
    
    logout: async () => {
      const token = browser ? localStorage.getItem('auth_token') : null;

      // Handle traditional auth logout
      if (token) {
        try {
          await fetch(`${API_URLS.AUTH_ME().replace('/me', '')}?endpoint=logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ token })
          });
        } catch (error) {
          console.error('Logout API call failed:', error);
        }
      }


      if (browser) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      }

      set({
        user: null,
        token: null,
        isLoggedIn: false,
        loading: false,
        session: null
      });
    },
    
    checkAuth: async () => {
      if (!browser) return;
      
      const token = localStorage.getItem('auth_token');
      const userStr = localStorage.getItem('user');
      
      if (!token || !userStr) {
        set({
          user: null,
          token: null,
          isLoggedIn: false,
          loading: false,
          session: null
        });
        return;
      }

      try {
        const response = await fetch(API_URLS.AUTH_ME(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          const userData = await response.json();
          set({
            user: userData,
            token,
            isLoggedIn: true,
            loading: false,
            session: null
          });
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          set({
            user: null,
            token: null,
            isLoggedIn: false,
            loading: false,
            session: null
          });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        set({
          user: null,
          token: null,
          isLoggedIn: false,
          loading: false,
          session: null
        });
      }
    }
  };
}

export const auth = createAuthStore();