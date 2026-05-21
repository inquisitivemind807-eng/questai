/**
 * API Client for Corpus RAG API
 * Handles authentication and API calls to the backend.
 *
 * Token management delegated to token_manager.ts — the single source
 * of truth that prevents race-condition token revocation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';
import { tokenManager } from './token_manager.js';

interface ApiConfig {
  baseUrl: string;
}

function summarizeBody(body: any): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const summary: Record<string, unknown> = {};
  const fields = ['job_id', 'platform', 'platform_job_id', 'job_title', 'company', 'questions_count'];
  for (const field of fields) {
    if (body[field] != null) summary[field] = body[field];
  }
  if (Array.isArray(body.questions)) summary.questions_count = body.questions.length;
  if (typeof body.job_details === 'string') summary.job_details_length = body.job_details.length;
  if (typeof body.resume_text === 'string') summary.resume_text_length = body.resume_text.length;
  return summary;
}

function shouldLogFullPayload(endpoint: string): boolean {
  return endpoint === '/api/questionAndAnswers' || endpoint === '/api/employer-questions/compare';
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
 * Get a valid access token via the TokenManager.
 * The TokenManager handles caching, refresh, locking, and conflict retry.
 */
async function getAccessToken(): Promise<string | null> {
  logger.auth('debug', 'auth.token_request', 'Requesting access token from TokenManager');
  const token = await tokenManager.getAccessToken();
  if (token) {
    logger.auth('debug', 'auth.token_ok', 'Valid access token obtained');
  } else {
    logger.auth('warn', 'auth.token_missing', 'No valid access token available — login required');
  }
  return token;
}

/**
 * Make an authenticated API request.
 * Automatically retries once with a force-refreshed token on 401.
 */
export async function apiRequest(
  endpoint: string,
  method: string = 'POST',
  body?: any,
  retryOn401: boolean = true
): Promise<any> {
  const config = getApiConfig();
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token available. Please login first.');
  }

  const doRequest = async (authToken: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };

    const url = `${config.baseUrl}${endpoint}`;
    const requestId = randomUUID().slice(0, 12);
    const startedAt = Date.now();

    logger.apiRequest(`${method} ${endpoint}`, {
      requestId,
      method,
      endpoint,
      url,
      bodySummary: summarizeBody(body),
      ...(shouldLogFullPayload(endpoint) ? { requestBody: body } : {})
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.apiError(`${method} ${endpoint}`, {
          requestId,
          status: response.status,
          durationMs: Date.now() - startedAt,
          errorText
        });
        return { ok: false, status: response.status, errorText };
      }

      const data = await response.json();
      logger.apiResponse(`${method} ${endpoint}`, {
        requestId,
        status: response.status,
        durationMs: Date.now() - startedAt,
        success: data?.success !== false,
        ...(shouldLogFullPayload(endpoint) ? { responseBody: data } : {})
      });
      return { ok: true, status: response.status, data };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.apiError(`${method} ${endpoint}`, {
          requestId,
          errorText: 'Request timed out after 120 seconds'
        });
        throw new Error(`API request timed out (120s): ${endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // First attempt
  let result = await doRequest(token);

  // On 401, force-refresh the token and retry once
  if (!result.ok && result.status === 401 && retryOn401) {
    logger.auth('info', 'auth.401_retry', 'Got 401 — attempting force token refresh and retry');
    const newToken = await tokenManager.forceRefresh();
    if (newToken && newToken !== token) {
      result = await doRequest(newToken);
    }
  }

  if (!result.ok) {
    throw new Error(`API request failed: ${result.status} - ${result.errorText}`);
  }

  return result.data;
}

/**
 * Save authentication token via TokenManager.
 * Writes to unified file + all legacy files.
 */
export function saveSessionToken(token: string): void {
  tokenManager.saveTokens({
    accessToken: token,
    refreshToken: '',
    expiresAt: Date.now() + 86400000, // 24h fallback
  });
  logger.auth('info', 'auth.session_saved', 'Session token saved via TokenManager');
}

/**
 * Clear all cached tokens.
 */
export function clearSessionToken(): void {
  tokenManager.clearTokens();
  logger.auth('info', 'auth.session_cleared', 'All tokens cleared via TokenManager');
}
