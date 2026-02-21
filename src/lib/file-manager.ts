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

export async function previewManagedFile(userId: string, fileId: string, maxChars = 8000): Promise<string> {
  return invoke<string>('preview_managed_file', {
    query: { userId, fileId, maxChars }
  });
}

export async function deleteManagedFiles(userId: string, fileIds: string[]): Promise<number> {
  return invoke<number>('delete_managed_files', {
    input: { userId, fileIds }
  });
}

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

export async function openManagedFile(userId: string, fileId: string): Promise<string> {
  return invoke<string>('open_managed_file', {
    input: { userId, fileId }
  });
}

export async function openManagedFileParent(userId: string, fileId: string): Promise<string> {
  return invoke<string>('open_managed_file_parent', {
    input: { userId, fileId }
  });
}

export async function exportManagedFilesBackup(userId: string): Promise<string> {
  return invoke<string>('export_managed_files_backup', { input: { userId } });
}

export async function importManagedFilesBackup(userId: string, backupPath: string): Promise<number> {
  return invoke<number>('import_managed_files_backup', {
    input: { userId, backupPath }
  });
}

export async function getManagedFilesQuota(userId: string): Promise<ManagedFilesQuotaInfo> {
  return invoke<ManagedFilesQuotaInfo>('get_managed_files_quota', { userId });
}

export async function rebuildManagedFilesIndex(userId: string): Promise<ManagedFilesRebuildResult> {
  return invoke<ManagedFilesRebuildResult>('rebuild_managed_files_index', { userId });
}
