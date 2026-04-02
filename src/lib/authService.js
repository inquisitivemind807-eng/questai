import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { invoke } from '@tauri-apps/api/core';

// Use environment variable for API base URL
const API_BASE_URL =
  import.meta.env.VITE_PUBLIC_API_BASE ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:3000';
const TOKEN_CACHE_FILE = '.cache/api_token.txt';

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    isLoggedIn: false,
    loading: true,
  });

  async function writeCache(filename, content) {
    try {
      await invoke('write_file_async', { filename, content: String(content) });
    } catch {
      // Fallback for browser dev without Tauri
      if (filename.includes('auth_access_token')) localStorage.setItem('auth_access_token', content);
      else if (filename.includes('auth_refresh_token')) localStorage.setItem('auth_refresh_token', content);
      else if (filename.includes('auth_expires_at')) localStorage.setItem('auth_expires_at', content);
      else if (filename.includes('auth_user')) localStorage.setItem('auth_user', content);
      else if (filename.includes('auth_remember_me')) localStorage.setItem('auth_remember_me', content);
    }
  }

  async function readCache(filename) {
    try {
      const result = await invoke('read_file_async', { filename });
      return result;
    } catch {
      // Fallback for browser dev without Tauri
      if (filename.includes('auth_access_token')) return localStorage.getItem('auth_access_token');
      if (filename.includes('auth_refresh_token')) return localStorage.getItem('auth_refresh_token');
      if (filename.includes('auth_expires_at')) return localStorage.getItem('auth_expires_at');
      if (filename.includes('auth_user')) return localStorage.getItem('auth_user');
      if (filename.includes('auth_remember_me')) return localStorage.getItem('auth_remember_me');
      return null;
    }
  }

  async function deleteCache(filename) {
    try {
      await invoke('delete_file_async', { filename });
    } catch {
      if (filename.includes('auth_access_token')) localStorage.removeItem('auth_access_token');
      else if (filename.includes('auth_refresh_token')) localStorage.removeItem('auth_refresh_token');
      else if (filename.includes('auth_expires_at')) localStorage.removeItem('auth_expires_at');
      else if (filename.includes('auth_user')) localStorage.removeItem('auth_user');
      else if (filename.includes('auth_remember_me')) localStorage.removeItem('auth_remember_me');
    }
  }

  /** Exchange session token for JWT access + refresh tokens */
  async function exchangeSessionForJwt(sessionToken) {
    const res = await fetch(`${API_BASE_URL}/api/auth/session-to-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to get JWT tokens');
    }
    const data = await res.json();
    if (!data.success || !data.accessToken || !data.refreshToken) {
      throw new Error('Invalid session-to-jwt response');
    }
    return data;
  }

  async function refreshAccessToken() {
    if (!browser) return null;

    const refreshToken = await readCache('.cache/auth_refresh_token.txt');
    if (!refreshToken) {
      console.log('No refresh token available.');
      await logout();
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        await setTokens(data);
        console.log('✅ Access token refreshed successfully.');
        return data.accessToken;
      } else {
        console.error('Failed to refresh access token.');
        await logout(); // If refresh fails, log the user out.
        return null;
      }
    } catch (error) {
      console.error('Error refreshing access token:', error);
      await logout();
      return null;
    }
  }

  async function setTokens(data) {
    if (!browser) return;
    const { accessToken, refreshToken, expiresIn, user } = data;
    await writeCache('.cache/auth_access_token.txt', accessToken);
    await writeCache('.cache/auth_refresh_token.txt', refreshToken);
    // Store expiry time (current time + expiresIn seconds)
    const expiresAt = new Date().getTime() + expiresIn * 1000;
    await writeCache('.cache/auth_expires_at.txt', expiresAt);

    if (user) {
      await writeCache('.cache/auth_user.json', JSON.stringify(user));
    }

    // Save the token for bot processes via Tauri IPC
    try {
      await invoke('write_file_async', { filename: TOKEN_CACHE_FILE, content: accessToken });
      console.log('✅ Token saved to shared cache for bot processes.');
    } catch (e) {
      console.error('Failed to save token to shared cache:', e);
    }
  }

  async function signup(email, password, name, rememberMe = true) {
    update(state => ({ ...state, loading: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (browser) {
          const jwtData = await exchangeSessionForJwt(data.token);
          await setTokens({
            accessToken: jwtData.accessToken,
            refreshToken: jwtData.refreshToken,
            expiresIn: jwtData.expiresIn,
            user: { ...data.user, ...jwtData.user }
          });
          await writeCache('.cache/auth_remember_me.txt', rememberMe ? 'true' : 'false');
        }

        set({
          user: data.user,
          isLoggedIn: true,
          loading: false,
        });
        console.log('✅ Signup successful');
        return { success: true };
      } else {
        throw new Error(data.error || 'Signup failed');
      }
    } catch (error) {
      console.error('Signup error:', error);
      update(state => ({ ...state, loading: false, user: null, isLoggedIn: false }));
      return { success: false, error: error.message };
    }
  }

  async function login(email, password, rememberMe = true) {
    update(state => ({ ...state, loading: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (browser) {
          const jwtData = await exchangeSessionForJwt(data.token);
          await setTokens({
            accessToken: jwtData.accessToken,
            refreshToken: jwtData.refreshToken,
            expiresIn: jwtData.expiresIn,
            user: { ...data.user, ...jwtData.user }
          });
          await writeCache('.cache/auth_remember_me.txt', rememberMe ? 'true' : 'false');
        }

        set({
          user: data.user,
          isLoggedIn: true,
          loading: false,
        });
        console.log('✅ Login successful');
        return { success: true };
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      update(state => ({ ...state, loading: false, user: null, isLoggedIn: false }));
      return { success: false, error: error.message };
    }
  }


  async function logout() {
    if (!browser) return;

    // Clear all auth cache files (and localStorage fallback)
    await deleteCache('.cache/auth_access_token.txt');
    await deleteCache('.cache/auth_refresh_token.txt');
    await deleteCache('.cache/auth_expires_at.txt');
    await deleteCache('.cache/auth_user.json');
    await deleteCache('.cache/auth_remember_me.txt');
    localStorage.removeItem('auth_access_token');
    localStorage.removeItem('auth_refresh_token');
    localStorage.removeItem('auth_expires_at');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('accessToken');
    sessionStorage.removeItem('accessToken');

    // Reset store
    set({ user: null, isLoggedIn: false, loading: false });

    // Clear the bot's cached token via Tauri IPC
    try {
      await invoke('delete_file_async', { filename: TOKEN_CACHE_FILE });
      console.log('✅ Cleared shared token cache.');
    } catch (e) {
      console.log('Could not clear shared token cache (it may not exist):', e);
    }

    console.log('Logged out.');
    goto('/login'); // Redirect to login page
  }

  async function getAccessToken() {
    if (!browser) return null;

    let accessToken = await readCache('.cache/auth_access_token.txt');
    const expiresAt = await readCache('.cache/auth_expires_at.txt');

    // Fallback: legacy session token in localStorage
    if (!accessToken) {
      accessToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    }

    if (!accessToken) return null;

    // Legacy session token (not JWT): convert to JWT once and store
    if (!accessToken.startsWith('eyJ')) {
      try {
        const jwtData = await exchangeSessionForJwt(accessToken);
        await setTokens({
          accessToken: jwtData.accessToken,
          refreshToken: jwtData.refreshToken,
          expiresIn: jwtData.expiresIn,
          user: jwtData.user
        });
        return jwtData.accessToken;
      } catch (e) {
        console.warn('session-to-jwt failed, token may be invalid:', e.message);
        return null;
      }
    }

    if (!expiresAt) return accessToken;

    // Check if token is expired or close to expiring (within 60 seconds)
    if (new Date().getTime() > parseInt(expiresAt, 10) - 60 * 1000) {
      console.log('Access token expired or nearing expiration, refreshing...');
      return await refreshAccessToken();
    }

    return accessToken;
  }

  async function initialize() {
    if (!browser) return;

    const rememberMe = await readCache('.cache/auth_remember_me.txt') || localStorage.getItem('auth_remember_me');

    // If user explicitly chose not to be remembered, treat as session-only:
    // clear tokens and return unauthenticated (mirrors old sessionStorage behaviour).
    if (rememberMe === 'false') {
      await deleteCache('.cache/auth_access_token.txt');
      await deleteCache('.cache/auth_refresh_token.txt');
      await deleteCache('.cache/auth_expires_at.txt');
      await deleteCache('.cache/auth_user.json');
      await deleteCache('.cache/auth_remember_me.txt');
      set({ user: null, isLoggedIn: false, loading: false });
      return;
    }

    const token = await readCache('.cache/auth_access_token.txt') || localStorage.getItem('auth_access_token') || localStorage.getItem('accessToken');
    const userStr = await readCache('.cache/auth_user.json') || localStorage.getItem('auth_user');
    const expiresAt = await readCache('.cache/auth_expires_at.txt') || localStorage.getItem('auth_expires_at');

    if (token && userStr) {
      const now = new Date().getTime();
      const expiry = expiresAt ? parseInt(expiresAt, 10) : null;

      if (!expiry || now < expiry) {
        try {
          const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
          set({ user, isLoggedIn: true, loading: false });
        } catch (e) {
          console.error('Failed to parse user data:', e);
          await logout();
        }
      } else {
        console.log('Session expired, attempting refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          // Re-read user data (may have been updated during refresh)
          const freshUserStr = await readCache('.cache/auth_user.json') || localStorage.getItem('auth_user');
          try {
            const user = typeof freshUserStr === 'string' ? JSON.parse(freshUserStr) : freshUserStr;
            set({ user, isLoggedIn: true, loading: false });
            console.log('✅ Session refreshed successfully');
          } catch (e) {
            console.error('Failed to parse user after refresh:', e);
            await logout();
          }
        } else {
          console.log('Refresh failed, logging out');
          await logout();
        }
      }
    } else {
      set({ user: null, isLoggedIn: false, loading: false });
    }
  }

  async function requestPasswordReset(email) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        throw new Error(data.error || 'Failed to request password reset');
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      return { success: false, error: error.message };
    }
  }

  async function resetPassword(token, newPassword) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        throw new Error(data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: error.message };
    }
  }

  return {
    subscribe,
    signup,
    login,
    logout,
    getAccessToken,
    initialize,
    requestPasswordReset,
    resetPassword,
  };
}

export const authService = createAuthStore();
