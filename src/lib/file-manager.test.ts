import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteManagedFiles,
  getManagedFiles,
  getManagedFilesQuota,
  rebuildManagedFilesIndex,
  registerManagedFile
} from './file-manager';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

describe('file-manager invoke wrappers', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('registerManagedFile invokes register command', async () => {
    mockInvoke.mockResolvedValue({ id: 'x' });
    await registerManagedFile({
      userId: 'u@example.com',
      feature: 'resume',
      filename: 'r.txt',
      content: 'hello'
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      'register_managed_file',
      expect.objectContaining({
        input: expect.objectContaining({
          userId: 'u@example.com',
          feature: 'resume',
          filename: 'r.txt'
        })
      })
    );
  });

  it('getManagedFiles invokes list query command', async () => {
    mockInvoke.mockResolvedValue([]);
    await getManagedFiles({ userId: 'u@example.com', feature: 'resume', search: 'abc' });
    expect(mockInvoke).toHaveBeenCalledWith(
      'get_managed_files',
      expect.objectContaining({
        query: expect.objectContaining({
          userId: 'u@example.com',
          feature: 'resume',
          search: 'abc'
        })
      })
    );
  });

  it('deleteManagedFiles invokes bulk delete command', async () => {
    mockInvoke.mockResolvedValue(2);
    await deleteManagedFiles('u@example.com', ['1', '2']);
    expect(mockInvoke).toHaveBeenCalledWith(
      'delete_managed_files',
      expect.objectContaining({
        input: { userId: 'u@example.com', fileIds: ['1', '2'] }
      })
    );
  });

  it('getManagedFilesQuota invokes quota command', async () => {
    mockInvoke.mockResolvedValue({ warningLevel: 'ok' });
    await getManagedFilesQuota('u@example.com');
    expect(mockInvoke).toHaveBeenCalledWith('get_managed_files_quota', { userId: 'u@example.com' });
  });

  it('rebuildManagedFilesIndex invokes rebuild command', async () => {
    mockInvoke.mockResolvedValue({ reindexedCount: 2, skippedCount: 0 });
    await rebuildManagedFilesIndex('u@example.com');
    expect(mockInvoke).toHaveBeenCalledWith('rebuild_managed_files_index', { userId: 'u@example.com' });
  });
});
