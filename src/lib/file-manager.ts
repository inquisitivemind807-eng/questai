/**
 * Managed Files — Tauri IPC Bridge
 * ------------------------------------------------------------------
 * Provides TypeScript wrappers around Tauri's `invoke()` for the
 * Rust-side managed file system. Supports register, list, preview,
 * delete, move, open, backup/restore, and quota operations.
 *
 * All files are stored under the user's app data directory:
 *   {appData}/FinalBoss/users/{userId}/storage/...
 */

import { invoke } from '@tauri-apps/api/core';

export type ManagedFeature = 'resume' | 'cover-letter' | 'enhancement' | 'other';

export interface ManagedFileEntry {
  id: string;
  userId: string;
  feature: string;
  jobId?: string | null;
  filename: string;
  storedName: string;
  relativePath: string;
  sourceRoute?: string | null;
  mimeType?: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface RegisterManagedFileInput {
  userId: string;
  feature: ManagedFeature | string;
  filename: string;
  content: string;
  jobId?: string;
  sourceRoute?: string;
  mimeType?: string;
  tags?: string[];
}

export interface RegisterManagedBinaryFileInput {
  userId: string;
  feature: ManagedFeature | string;
  filename: string;
  contentBase64: string;
  jobId?: string;
  sourceRoute?: string;
  mimeType?: string;
  tags?: string[];
}

export interface ManagedFilesQuotaInfo {
  usedFileCount: number;
  maxFileCount: number;
  usedBytes: number;
  maxBytes: number;
  fileCountUsagePercent: number;
  bytesUsagePercent: number;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface ManagedFilesRebuildResult {
  reindexedCount: number;
  skippedCount: number;
}

/** Register a text file (string content) in the managed file store. */
export async function registerManagedFile(input: RegisterManagedFileInput): Promise<ManagedFileEntry> {
  return invoke<ManagedFileEntry>('register_managed_file', {
    input: {
      userId: input.userId,
      feature: input.feature,
      filename: input.filename,
      content: input.content,
      jobId: input.jobId,
      sourceRoute: input.sourceRoute,
      mimeType: input.mimeType,
      tags: input.tags ?? []
    }
  });
}

/** Register a binary file (base64 content) in the managed file store. */
export async function registerManagedBinaryFile(input: RegisterManagedBinaryFileInput): Promise<ManagedFileEntry> {
  return invoke<ManagedFileEntry>('register_managed_file_base64', {
    input: {
      userId: input.userId,
      feature: input.feature,
      filename: input.filename,
      contentBase64: input.contentBase64,
      jobId: input.jobId,
      sourceRoute: input.sourceRoute,
      mimeType: input.mimeType,
      tags: input.tags ?? []
    }
  });
}

/** List managed files for a user, optionally filtered by feature, search, or jobId. */
export async function getManagedFiles(params: {
  userId: string;
  feature?: string;
  search?: string;
  jobId?: string;
}): Promise<ManagedFileEntry[]> {
  return invoke<ManagedFileEntry[]>('get_managed_files', {
    query: {
      userId: params.userId,
      feature: params.feature,
      search: params.search,
      jobId: params.jobId
    }
  });
}

/** Preview file content as a string (first maxChars characters). */
export async function previewManagedFile(userId: string, fileId: string, maxChars = 8000): Promise<string> {
  return invoke<string>('preview_managed_file', {
    query: { userId, fileId, maxChars }
  });
}

/** Delete managed files by ID. Returns the count of deleted files. */
export async function deleteManagedFiles(userId: string, fileIds: string[]): Promise<number> {
  return invoke<number>('delete_managed_files', {
    input: { userId, fileIds }
  });
}

/** Move managed files to a different feature/jobId context. */
export async function moveManagedFiles(
  userId: string,
  fileIds: string[],
  targetFeature: string,
  targetJobId?: string
): Promise<number> {
  return invoke<number>('move_managed_files', {
    input: { userId, fileIds, targetFeature, targetJobId }
  });
}

/** Open a managed file with the OS default application. */
export async function openManagedFile(userId: string, fileId: string): Promise<string> {
  return invoke<string>('open_managed_file', {
    input: { userId, fileId }
  });
}

/** Open the parent folder containing a managed file. */
export async function openManagedFileParent(userId: string, fileId: string): Promise<string> {
  return invoke<string>('open_managed_file_parent', {
    input: { userId, fileId }
  });
}

/** Export all managed files as a backup ZIP. Returns the backup path. */
export async function exportManagedFilesBackup(userId: string): Promise<string> {
  return invoke<string>('export_managed_files_backup', { input: { userId } });
}

/** Import managed files from a backup ZIP. Returns the count of imported files. */
export async function importManagedFilesBackup(userId: string, backupPath: string): Promise<number> {
  return invoke<number>('import_managed_files_backup', {
    input: { userId, backupPath }
  });
}

/** Get storage quota info (used/max files and bytes). */
export async function getManagedFilesQuota(userId: string): Promise<ManagedFilesQuotaInfo> {
  return invoke<ManagedFilesQuotaInfo>('get_managed_files_quota', { userId });
}

/** Rebuild the managed files index from disk (repair operation). */
export async function rebuildManagedFilesIndex(userId: string): Promise<ManagedFilesRebuildResult> {
  return invoke<ManagedFilesRebuildResult>('rebuild_managed_files_index', { userId });
}
