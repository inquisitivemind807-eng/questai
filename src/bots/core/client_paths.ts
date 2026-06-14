/**
 * Client Path Utilities
 * ------------------------------------------------------------------
 * Resolves per-client, per-platform, per-job directory paths for
 * storing artifacts (cover letters, resumes, Q&A responses, job
 * details JSON). Supports both the new canonical path structure
 * (`clients/{email}/jobs/{platform}/{jobId}/`) and legacy fallback
 * paths for backward compatibility.
 *
 * Key functions:
 * - `getJobArtifactDir()` — primary path resolver; prefers client dir
 * - `getJobArtifactCandidates()` — returns all possible dirs for reads
 * - `sanitizeEmailForPath()` — normalizes email into a safe folder name
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Convert an email address to a filesystem-safe directory name.
 * Replaces '@' with '_at_' and strips non-alphanumeric characters.
 * Returns 'unknown_client' for empty/missing emails.
 */
export function sanitizeEmailForPath(email: string): string {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return 'unknown_client';
  return normalized
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Extract the client email from the workflow context.
 * Checks `config.formData.email`, `config.email`, `ctx.clientEmail`,
 * and the `CLIENT_EMAIL` env var — in that order.
 */
export function getClientEmailFromContext(ctx: any): string {
  const fromFormData = ctx?.config?.formData?.email;
  const fromConfig = ctx?.config?.email;
  const fromContext = ctx?.clientEmail;
  const fromEnv = process.env.CLIENT_EMAIL;
  return String(fromFormData || fromConfig || fromContext || fromEnv || '').trim().toLowerCase();
}

/** Resolve the root directory for a given client: `clients/{sanitizedEmail}/`. */
export function getClientRootDir(clientEmail: string): string {
  return path.join(process.cwd(), 'clients', sanitizeEmailForPath(clientEmail));
}

/**
 * Resolve the job directory for a specific platform and job ID:
 * `clients/{email}/jobs/{platform}/{jobId}/`.
 */
export function getClientJobDir(clientEmail: string, platform: 'seek' | 'linkedin' | 'other', jobId: string): string {
  return path.join(getClientRootDir(clientEmail), 'jobs', platform, String(jobId));
}

/** Create a directory safely (recursive mkdir if it doesn't exist). */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Legacy job directory path: `jobs/{platform}/{jobId}/`. */
export function getLegacyJobDir(platform: 'seek' | 'linkedin' | 'other', jobId: string): string {
  return path.join(process.cwd(), 'jobs', platform, String(jobId));
}

/**
 * Primary artifact directory resolver.
 * Uses the client directory if a client email is available;
 * otherwise falls back to the legacy path.
 */
export function getJobArtifactDir(ctx: any, platform: 'seek' | 'linkedin' | 'other', jobId: string): string {
  const clientEmail = getClientEmailFromContext(ctx);
  if (clientEmail) {
    const dir = getClientJobDir(clientEmail, platform, jobId);
    ensureDir(dir);
    return dir;
  }
  const legacy = getLegacyJobDir(platform, jobId);
  ensureDir(legacy);
  return legacy;
}

/**
 * Returns all possible directory paths where job artifacts might exist.
 * Useful for reading files that may have been written by older bot
 * versions (includes the new canonical path and multiple legacy paths).
 */
export function getJobArtifactCandidates(ctx: any, platform: 'seek' | 'linkedin' | 'other', jobId: string): string[] {
  const dirs: string[] = [];
  const clientEmail = getClientEmailFromContext(ctx);
  if (clientEmail) {
    dirs.push(getClientJobDir(clientEmail, platform, jobId));
  }
  // New canonical path
  dirs.push(getLegacyJobDir(platform, jobId));
  // Old legacy paths as read fallbacks
  if (platform === 'linkedin') {
    dirs.push(path.join(process.cwd(), 'jobs', 'linkedinjobs', String(jobId)));
  }
  dirs.push(path.join(process.cwd(), 'src', 'bots', 'jobs', String(jobId)));
  return Array.from(new Set(dirs));
}
