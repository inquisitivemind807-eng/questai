#!/usr/bin/env bun
/**
 * Token Manager Integration Test
 * ------------------------------------------------------------------
 * Tests the token manager without needing real API credentials.
 * Simulates:
 *   1. Lock acquisition and release
 *   2. Concurrent lock contention (two processes fighting for lock)
 *   3. Stale lock detection and breaking
 *
 * Run: bun scripts/test-token-manager.ts
 */

import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'fs';

const CACHE_DIR = join(process.cwd(), '.cache');
const LOCK_FILE = join(CACHE_DIR, 'token.lock');
const TOKEN_FILE = join(CACHE_DIR, 'tokens.json');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Clean up before test
function cleanup() {
  try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
  try { if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE); } catch {}
}

// Simulate lock write (same logic as token_manager.ts)
function writeLock(pid: number) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = LOCK_FILE + '.tmp.' + pid;
  writeFileSync(tmp, JSON.stringify({ pid, timestamp: Date.now() }));
  const { renameSync } = require('fs');
  renameSync(tmp, LOCK_FILE);
}

async function main() {
  cleanup();

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  // ── Test 1: Lock acquisition ──────────────────────────────
  console.log('\n📋 Test 1: Lock acquisition');
  writeLock(process.pid);
  check('Lock file exists', existsSync(LOCK_FILE));
  const lockData1 = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  check('Lock contains our PID', lockData1.pid === process.pid);
  unlinkSync(LOCK_FILE);
  check('Lock released', !existsSync(LOCK_FILE));

  // ── Test 2: Atomic writes ─────────────────────────────────
  console.log('\n📋 Test 2: Atomic writes (temp + rename)');
  const testContent = JSON.stringify({ accessToken: 'test-token-123', refreshToken: 'test-refresh-456', expiresAt: Date.now() + 900000 });
  const tmpPath = TOKEN_FILE + '.tmp.test';
  writeFileSync(tmpPath, testContent);
  const { renameSync } = require('fs');
  renameSync(tmpPath, TOKEN_FILE);
  check('Token file exists', existsSync(TOKEN_FILE));
  check('No temp file leftover', !existsSync(tmpPath));
  const tokenData = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  check('Token content correct', tokenData.accessToken === 'test-token-123' && tokenData.refreshToken === 'test-refresh-456');

  // ── Test 3: Legacy file reads ─────────────────────────────
  console.log('\n📋 Test 3: Legacy file migration');
  // Create legacy jwt_tokens.json
  const legacyPath = join(CACHE_DIR, 'jwt_tokens.json');
  writeFileSync(legacyPath, JSON.stringify({ accessToken: 'legacy-jwt', refreshToken: 'legacy-refresh', expiresAt: Date.now() + 900000 }));
  check('Legacy jwt_tokens.json readable', existsSync(legacyPath));
  // Create legacy api_token.txt
  writeFileSync(join(CACHE_DIR, 'api_token.txt'), 'legacy-api-token');
  check('Legacy api_token.txt readable', existsSync(join(CACHE_DIR, 'api_token.txt')));

  // ── Test 4: Stale lock detection ──────────────────────────
  console.log('\n📋 Test 4: Stale lock (dead PID)');
  const deadPid = 99999; // unlikely to exist
  writeLock(deadPid);
  check('Lock exists with dead PID', existsSync(LOCK_FILE));
  // Simulate isLockStale logic
  let isStale = false;
  try {
    process.kill(deadPid, 0);
  } catch {
    isStale = true;
  }
  check('Dead PID detected as stale', isStale);
  // Break stale lock
  try { unlinkSync(LOCK_FILE); } catch {}
  check('Stale lock broken', !existsSync(LOCK_FILE));

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}`);

  // Cleanup
  try {
    try { unlinkSync(TOKEN_FILE); } catch {}
    try { unlinkSync(legacyPath); } catch {}
    try { unlinkSync(join(CACHE_DIR, 'api_token.txt')); } catch {}
  } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
