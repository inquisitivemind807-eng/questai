/**
 * Token Manager — Single Source of Truth for JWT Auth
 * ------------------------------------------------------------------
 * Solves the "token race" problem permanently:
 *
 * Problem: 7 cache files, 2 independent refresh paths (UI + bots),
 * single-use refresh tokens → second user of a refresh token gets
 * "Token reuse detected - all tokens revoked" → everyone locked out.
 *
 * Solution:
 *   1. ONE token file:  .cache/tokens.json  (atomic write via temp+rename)
 *   2. File-based lock: .cache/token.lock    (prevents concurrent refresh)
 *   3. Conflict retry:  on refresh failure, re-read (another process may
 *      have refreshed while we were waiting) — retry up to 3 times
 *   4. Legacy sync:     writes back to old auth_* files for compatibility
 *   5. Graceful degrade: if all else fails, returns null (caller handles)
 *
 * Usage:
 *   import { tokenManager } from './token_manager.js';
 *   const token = await tokenManager.getAccessToken();
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms — when the access token expires
}

interface LockData {
  pid: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(process.cwd(), '.cache');
const TOKEN_FILE = path.join(CACHE_DIR, 'tokens.json');
const LOCK_FILE = path.join(CACHE_DIR, 'token.lock');

// Legacy files kept in sync for backward compatibility
const LEGACY_FILES = {
  accessToken: path.join(CACHE_DIR, 'auth_access_token.txt'),
  refreshToken: path.join(CACHE_DIR, 'auth_refresh_token.txt'),
  expiresAt: path.join(CACHE_DIR, 'auth_expires_at.txt'),
  apiToken: path.join(CACHE_DIR, 'api_token.txt'),
  jwtTokens: path.join(CACHE_DIR, 'jwt_tokens.json'),
};

const LOCK_TIMEOUT_MS = 30_000; // max wait for lock acquisition
const LOCK_STALE_MS = 60_000; // consider lock stale after 60s (crashed process)
const REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // wait 2s before retry (let other process finish)

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Atomic write: write to temp file, then rename (POSIX atomic) */
function atomicWrite(filePath: string, content: string): void {
  ensureCacheDir();
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/** Read JSON file, return null if missing or corrupt */
function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Write a small text file (for legacy compatibility) */
function writeTextFile(filePath: string, content: string): void {
  ensureCacheDir();
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

function readLock(): LockData | null {
  return readJson<LockData>(LOCK_FILE);
}

function writeLock(): void {
  const lock: LockData = { pid: process.pid, timestamp: Date.now() };
  atomicWrite(LOCK_FILE, JSON.stringify(lock));
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lock = readLock();
      if (lock && lock.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // best-effort cleanup
  }
}

function isLockStale(lock: LockData): boolean {
  // Check if the locking process is still alive
  try {
    process.kill(lock.pid, 0); // signal 0 = check existence
    return false; // process exists, lock is valid
  } catch {
    // Process doesn't exist — lock is stale
    return true;
  }
}

/**
 * Acquire the token refresh lock.
 * Waits up to LOCK_TIMEOUT_MS for the lock to become available.
 * Returns true if lock acquired, false if timed out.
 */
async function acquireLock(): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
    const existing = readLock();

    if (!existing) {
      // No lock — grab it
      writeLock();
      // Double-check (prevent race between read and write)
      const confirm = readLock();
      if (confirm && confirm.pid === process.pid) {
        return true;
      }
      // Lost the race, try again
      await sleep(50 + Math.random() * 100);
      continue;
    }

    if (existing.pid === process.pid) {
      // We already hold the lock (re-entry)
      return true;
    }

    if (isLockStale(existing)) {
      // Stale lock from dead process — break it
      try { fs.unlinkSync(LOCK_FILE); } catch { /* ok */ }
      continue;
    }

    // Lock held by another live process — wait
    await sleep(100 + Math.random() * 200);
  }

  return false; // timed out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

function readTokens(): TokenData | null {
  return readJson<TokenData>(TOKEN_FILE);
}

function writeTokens(tokens: TokenData): void {
  atomicWrite(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

/** Sync tokens to legacy files so the UI and old bot code still work */
function syncToLegacyFiles(tokens: TokenData): void {
  try {
    writeTextFile(LEGACY_FILES.accessToken, tokens.accessToken);
    writeTextFile(LEGACY_FILES.refreshToken, tokens.refreshToken);
    writeTextFile(LEGACY_FILES.expiresAt, String(tokens.expiresAt));
    writeTextFile(LEGACY_FILES.apiToken, tokens.accessToken);
    // Also update jwt_tokens.json (read by old api_client.ts path)
    const jwtPayload = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    writeTextFile(LEGACY_FILES.jwtTokens, JSON.stringify(jwtPayload, null, 2));
  } catch {
    // Legacy sync is best-effort; primary file is tokens.json
  }
}

/** Try reading from legacy files (migration path) */
function readLegacyTokens(): TokenData | null {
  try {
    // Try jwt_tokens.json first (old bot path)
    const jwt = readJson<{ accessToken: string; refreshToken: string; expiresAt: number }>(
      LEGACY_FILES.jwtTokens
    );
    if (jwt?.accessToken && jwt?.refreshToken) {
      return {
        accessToken: jwt.accessToken,
        refreshToken: jwt.refreshToken,
        expiresAt: jwt.expiresAt || 0,
      };
    }

    // Try auth_* files
    const accessToken = readTextFile(LEGACY_FILES.accessToken);
    const refreshToken = readTextFile(LEGACY_FILES.refreshToken);
    const expiresAtStr = readTextFile(LEGACY_FILES.expiresAt);

    if (accessToken && refreshToken) {
      return {
        accessToken,
        refreshToken,
        expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : 0,
      };
    }

    // Try api_token.txt (session token / JWT)
    const apiToken = readTextFile(LEGACY_FILES.apiToken);
    if (apiToken) {
      return {
        accessToken: apiToken,
        refreshToken: '', // no refresh token available from this path
        expiresAt: 0, // unknown — will trigger refresh attempt
      };
    }

    return null;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function isTokenExpired(tokens: TokenData): boolean {
  return Date.now() > tokens.expiresAt - REFRESH_BUFFER_MS;
}

// ---------------------------------------------------------------------------
// Token Manager
// ---------------------------------------------------------------------------

class TokenManager {
  /**
   * Get a valid access token.
   * - Returns cached token if still valid
   * - Refreshes if expired (with locking + retry)
   * - Migrates from legacy files on first run
   * - Returns null if no token available and refresh fails
   */
  async getAccessToken(): Promise<string | null> {
    // 1. Read from unified file (or migrate from legacy)
    let tokens = readTokens() || readLegacyTokens();

    if (!tokens || !tokens.accessToken) {
      console.log('[TokenManager] No cached tokens found');
      return null;
    }

    // 2. If access token is still valid, return it
    if (!isTokenExpired(tokens)) {
      return tokens.accessToken;
    }

    // 3. Need to refresh
    console.log('[TokenManager] Access token expired, attempting refresh...');
    return this.refreshWithRetry(tokens);
  }

  /**
   * Force a token refresh (useful when server returns 401 despite valid expiry).
   */
  async forceRefresh(): Promise<string | null> {
    let tokens = readTokens() || readLegacyTokens();
    if (!tokens?.refreshToken) {
      console.log('[TokenManager] No refresh token available for force refresh');
      return null;
    }
    // Force expiry to trigger refresh
    tokens.expiresAt = 0;
    return this.refreshWithRetry(tokens);
  }

  /**
   * Refresh with retry logic for race conditions.
   */
  private async refreshWithRetry(tokens: TokenData): Promise<string | null> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Acquire lock to prevent concurrent refresh
      const locked = await acquireLock();
      if (!locked) {
        console.log('[TokenManager] Could not acquire lock, retrying...');
        await sleep(RETRY_DELAY_MS);
        // Re-read — another process may have refreshed
        const fresh = readTokens();
        if (fresh && !isTokenExpired(fresh)) {
          releaseLock();
          return fresh.accessToken;
        }
        continue;
      }

      try {
        // Re-read inside lock (may have been refreshed while waiting)
        const current = readTokens() || tokens;
        if (current.accessToken && !isTokenExpired(current)) {
          console.log('[TokenManager] Token already refreshed by another process');
          return current.accessToken;
        }

        // Need refresh token to proceed
        const rt = current.refreshToken || tokens.refreshToken;
        if (!rt) {
          console.log('[TokenManager] No refresh token available');
          return null;
        }

        // Call the refresh API
        console.log('[TokenManager] Calling /api/auth/refresh...');
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });

        if (response.ok) {
          const data = await response.json();
          const newTokens: TokenData = {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: Date.now() + (data.expiresIn || 900) * 1000,
          };

          // Write to unified file
          writeTokens(newTokens);
          // Sync to legacy files
          syncToLegacyFiles(newTokens);

          console.log('[TokenManager] ✅ Token refreshed successfully');
          return newTokens.accessToken;
        }

        // Refresh failed — check why
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || '';

        if (errorMsg.includes('Token reuse') || errorMsg.includes('revoked')) {
          // Someone else used our refresh token first.
          // Wait, re-read tokens.json — they may have saved the new tokens.
          console.log('[TokenManager] Token reuse detected — another process refreshed. Retrying...');
          releaseLock();
          await sleep(RETRY_DELAY_MS);

          const fresh = readTokens();
          if (fresh && fresh.accessToken && !isTokenExpired(fresh)) {
            console.log('[TokenManager] ✅ Found fresh tokens from another process');
            return fresh.accessToken;
          }

          // If no fresh tokens found, the other process might be the UI
          // which writes to legacy files. Check there too.
          const legacy = readLegacyTokens();
          if (legacy && legacy.accessToken && !isTokenExpired(legacy)) {
            // Migrate to unified file
            writeTokens(legacy);
            syncToLegacyFiles(legacy);
            console.log('[TokenManager] ✅ Migrated fresh tokens from legacy files');
            return legacy.accessToken;
          }

          // All tokens are truly revoked — need re-login
          console.log('[TokenManager] ❌ All tokens revoked — re-login required');
          return null;
        }

        // Other refresh error (network, server error, etc.)
        console.log(`[TokenManager] Refresh failed: ${errorMsg}`);
        releaseLock();
        await sleep(RETRY_DELAY_MS);
        continue;
      } catch (error) {
        console.log(`[TokenManager] Refresh error: ${error}`);
        releaseLock();
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }

    console.log('[TokenManager] ❌ All refresh attempts exhausted');
    return null;
  }

  /**
   * Save tokens from external source (UI login, manual refresh).
   * Writes to unified file AND all legacy files.
   */
  saveTokens(tokens: TokenData): void {
    const locked = acquireLock; // non-blocking — we just write
    writeTokens(tokens);
    syncToLegacyFiles(tokens);
    console.log('[TokenManager] 💾 Tokens saved');
  }

  /**
   * Clear all tokens (logout).
   */
  clearTokens(): void {
    try {
      const files = [
        TOKEN_FILE,
        LOCK_FILE,
        ...Object.values(LEGACY_FILES),
      ];
      for (const f of files) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ok */ }
      }
      console.log('[TokenManager] 🗑️ All tokens cleared');
    } catch {
      // best-effort
    }
  }

  /**
   * Check if any tokens exist (without refreshing).
   */
  hasTokens(): boolean {
    return !!(readTokens() || readLegacyTokens());
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const tokenManager = new TokenManager();
