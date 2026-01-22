/**
 * API Client for Corpus RAG API
 * Handles authentication and API calls to the backend
 */

import * as fs from 'fs';
import * as path from 'path';

interface ApiConfig {
  baseUrl: string;
}

interface JwtTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Get API configuration from environment
 */
function getApiConfig(): ApiConfig {
  return {
    baseUrl: process.env.API_BASE || 'http://localhost:3000',
  };
}

/**
 * Get session token from the shared cache.
 * The UI process is responsible for keeping this token valid.
 */
async function getSessionToken(): Promise<string | null> {
  const tokenCachePath = path.join(process.cwd(), '.cache', 'api_token.txt');

  if (fs.existsSync(tokenCachePath)) {
    const cachedToken = fs.readFileSync(tokenCachePath, 'utf8').trim();
    if (cachedToken) {
      console.log('✅ Using shared authentication token for bot process.');
      return cachedToken;
    }
  }

  console.log('ℹ️ No shared authentication token available for bot process.');
  return null;
}

/**
 * Get or refresh JWT access token
 */
async function getAccessToken(): Promise<string | null> {
  const jwtCachePath = path.join(process.cwd(), '.cache', 'jwt_tokens.json');

  // Check if we have cached JWT tokens
  if (fs.existsSync(jwtCachePath)) {
    try {
      const cached: JwtTokens = JSON.parse(fs.readFileSync(jwtCachePath, 'utf8'));

      // Check if access token is still valid (with 1 minute buffer)
      if (cached.expiresAt > Date.now() + 60000) {
        console.log('✅ Using cached JWT access token');
        return cached.accessToken;
      }

      // Try to refresh the token
      console.log('🔄 Access token expired, refreshing...');
      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cached.refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        const newTokens: JwtTokens = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: Date.now() + (data.expiresIn * 1000)
        };
        fs.writeFileSync(jwtCachePath, JSON.stringify(newTokens, null, 2));
        console.log('✅ JWT token refreshed successfully');
        return newTokens.accessToken;
      }
    } catch (error) {
      console.log('⚠️ Error refreshing JWT, will try session token conversion');
    }
  }

  // Convert session token to JWT
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return null;
  }

  try {
    console.log('🔄 Converting session token to JWT...');
    const config = getApiConfig();
    const response = await fetch(`${config.baseUrl}/api/auth/session-to-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Session to JWT conversion failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const tokens: JwtTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (data.expiresIn * 1000)
    };

    // Cache the JWT tokens
    const cacheDir = path.join(process.cwd(), '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(jwtCachePath, JSON.stringify(tokens, null, 2));

    console.log('✅ Session token converted to JWT successfully');
    return tokens.accessToken;
  } catch (error) {
    console.error(`❌ Error converting session to JWT: ${error}`);
    return null;
  }
}

/**
 * Make an authenticated API request
 */
export async function apiRequest(
  endpoint: string,
  method: string = 'POST',
  body?: any
): Promise<any> {
  const config = getApiConfig();
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token available. Please login first.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const url = `${config.baseUrl}${endpoint}`;

  console.log(`🔵 API Request: ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API Error Response: ${response.status} - ${errorText}`);
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ API Response: Success`);
  return data;
}

// The save and clear functions are kept for potential direct use or testing,
// but the primary flow is now managed by the UI via Tauri IPC.

/**
 * Save authentication token to cache
 */
export function saveSessionToken(token: string): void {
  const cacheDir = path.join(process.cwd(), '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const tokenCachePath = path.join(cacheDir, 'api_token.txt');
  fs.writeFileSync(tokenCachePath, token, 'utf8');
  console.log('✅ Session token saved to cache');
}

/**
 * Clear cached session token
 */
export function clearSessionToken(): void {
  const tokenCachePath = path.join(process.cwd(), '.cache', 'api_token.txt');
  if (fs.existsSync(tokenCachePath)) {
    fs.unlinkSync(tokenCachePath);
    console.log('✅ Session token cleared');
  }
}
