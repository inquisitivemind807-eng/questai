import { describe, expect, it } from 'vitest';
import type { ManagedFileEntry } from './file-manager';
import { filterManagedFiles, groupManagedFilesByJob } from './file-manager-utils';

function mk(overrides: Partial<ManagedFileEntry>): ManagedFileEntry {
  return {
    id: overrides.id || '1',
    userId: overrides.userId || 'u',
    feature: overrides.feature || 'resume',
    jobId: overrides.jobId,
    filename: overrides.filename || 'file.txt',
    storedName: overrides.storedName || 'stored.txt',
    relativePath: overrides.relativePath || 'storage/resume/stored.txt',
    sourceRoute: overrides.sourceRoute || '/route',
    mimeType: overrides.mimeType || 'text/plain',
    size: overrides.size ?? 100,
    createdAt: overrides.createdAt || '1',
    updatedAt: overrides.updatedAt || '1',
    tags: overrides.tags || []
  };
}

describe('file-manager-utils', () => {
  it('filters by feature and search', () => {
    const files = [
      mk({ id: '1', feature: 'resume', filename: 'resume-a.txt' }),
      mk({ id: '2', feature: 'cover-letter', filename: 'letter-a.txt' })
    ];
    const out = filterManagedFiles(files, 'resume', 'resume', 'all');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('groups by job id with ungrouped fallback', () => {
    const files = [
      mk({ id: '1', jobId: 'job-1', updatedAt: '10' }),
      mk({ id: '2', jobId: 'job-1', updatedAt: '11' }),
      mk({ id: '3', jobId: undefined, updatedAt: '12' })
    ];
    const groups = groupManagedFilesByJob(files);
    expect(groups.get('job-1')?.map((f) => f.id)).toEqual(['2', '1']);
    expect(groups.get('ungrouped')?.map((f) => f.id)).toEqual(['3']);
  });
});
