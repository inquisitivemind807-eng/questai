#!/usr/bin/env bun
/**
 * Safe Token Refresh CLI
 * ------------------------------------------------------------------
 * Usage: bun scripts/refresh-token.ts
 *
 * Safely refreshes the JWT access token using the cached refresh token.
 * Uses the TokenManager's locking to prevent race conditions with bots.
 *
 * What it does:
 *   1. Reads the unified token file (.cache/tokens.json) or legacy files
 *   2. Acquires the token refresh lock
 *   3. Calls /api/auth/refresh exactly once (no double-use risk)
 *   4. Writes new tokens to unified file AND all legacy files
 *   5. Releases the lock
 *
 * Exit codes:
 *   0 — token refreshed successfully
 *   1 — no refresh token available (need login)
 *   2 — refresh failed (network error, server down, token revoked)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.cache');
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// ── Helpers ────────────────────────────────────────────────

function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function readJson(path: string): any {
  try {
    return JSON.parse(readText(path) || 'null');
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Locking ────────────────────────────────────────────────

const LOCK_FILE = join(CACHE_DIR, 'token.lock');

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    const lock = readJson(LOCK_FILE);
    if (lock) {
      // Check if lock holder is still alive
      try {
        process.kill(lock.pid, 0);
        console.error('❌ Another process holds the token lock (PID:', lock.pid, ')');
        return false;
      } catch {
        // Process dead — stale lock, break it
        const { unlinkSync } = require('fs');
        try { unlinkSync(LOCK_FILE); } catch { /* ok */ }
      }
    }
  }
  // Write lock
  const { writeFileSync } = require('fs');
  const tmp = LOCK_FILE + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  const { renameSync } = require('fs');
  renameSync(tmp, LOCK_FILE);
  return true;
}

function releaseLock(): void {
  try {
    const lock = readJson(LOCK_FILE);
    if (lock && lock.pid === process.pid) {
      const { unlinkSync } = require('fs');
      unlinkSync(LOCK_FILE);
    }
  } catch { /* ok */ }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  // 1. Find refresh token
  let refreshToken: string | null = null;

  // Try unified file first
  const unified = readJson(join(CACHE_DIR, 'tokens.json'));
  if (unified?.refreshToken) {
    refreshToken = unified.refreshToken;
    console.log('📄 Found refresh token in tokens.json');
  }

  // Try legacy files
  if (!refreshToken) {
    refreshToken = readText(join(CACHE_DIR, 'auth_refresh_token.txt'));
    if (refreshToken) console.log('📄 Found refresh token in auth_refresh_token.txt');
  }

  // Try jwt_tokens.json
  if (!refreshToken) {
    const jwt = readJson(join(CACHE_DIR, 'jwt_tokens.json'));
    if (jwt?.refreshToken) {
      refreshToken = jwt.refreshToken;
      console.log('📄 Found refresh token in jwt_tokens.json');
    }
  }

  if (!refreshToken) {
    console.error('❌ No refresh token found. Please login via the app first.');
    process.exit(1);
  }

  // 2. Acquire lock
  if (!acquireLock()) {
    console.error('❌ Could not acquire lock. Try again in a few seconds.');
    process.exit(2);
  }

  try {
    // 3. Refresh via API
    console.log('🔄 Calling /api/auth/refresh...');
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (err.error?.includes('Token reuse') || err.error?.includes('revoked')) {
        console.error('❌ Token already used (reuse detected).');
        console.error('   This means another process already refreshed.');
        console.error('   Check tokens.json — it may already have the new token.');
        process.exit(2);
      }
      console.error('❌ Refresh failed:', response.status, err.error || response.statusText);
      process.exit(2);
    }

    const data = await response.json();
    if (!data.accessToken) {
      console.error('❌ Invalid response from refresh endpoint');
      process.exit(2);
    }

    // 4. Save to unified file
    const { writeFileSync, mkdirSync } = require('fs');
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

    const tokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (data.expiresIn || 900) * 1000,
    };

    // Atomic write to unified file
    const tmpPath = join(CACHE_DIR, 'tokens.json.tmp.' + process.pid);
    writeFileSync(tmpPath, JSON.stringify(tokens, null, 2));
    const { renameSync } = require('fs');
    renameSync(tmpPath, join(CACHE_DIR, 'tokens.json'));

    // 5. Sync to legacy files
    const legacyFiles: Record<string, string> = {
      'auth_access_token.txt': tokens.accessToken,
      'auth_refresh_token.txt': tokens.refreshToken,
      'auth_expires_at.txt': String(tokens.expiresAt),
      'api_token.txt': tokens.accessToken,
      'jwt_tokens.json': JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }, null, 2),
    };

    for (const [filename, content] of Object.entries(legacyFiles)) {
      const p = join(CACHE_DIR, filename);
      writeFileSync(p, content, 'utf8');
    }

    const expiryDate = new Date(tokens.expiresAt).toLocaleString();
    console.log('✅ Token refreshed successfully!');
    console.log('   Access token expires:', expiryDate);
    console.log('   Files updated: tokens.json + 5 legacy files');
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err.message);
  releaseLock();
  process.exit(2);
});
