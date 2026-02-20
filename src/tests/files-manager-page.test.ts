// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FilesPage from '../routes/files/+page.svelte';

const mocks = vi.hoisted(() => ({
  getManagedFiles: vi.fn(),
  previewManagedFile: vi.fn(),
  deleteManagedFiles: vi.fn(),
  moveManagedFiles: vi.fn(),
  openManagedFile: vi.fn(),
  openManagedFileParent: vi.fn(),
  exportManagedFilesBackup: vi.fn(),
  importManagedFilesBackup: vi.fn(),
  getManagedFilesQuota: vi.fn()
}));

vi.mock('$lib/file-manager', () => ({
  getManagedFiles: mocks.getManagedFiles,
  previewManagedFile: mocks.previewManagedFile,
  deleteManagedFiles: mocks.deleteManagedFiles,
  moveManagedFiles: mocks.moveManagedFiles,
  openManagedFile: mocks.openManagedFile,
  openManagedFileParent: mocks.openManagedFileParent,
  exportManagedFilesBackup: mocks.exportManagedFilesBackup,
  importManagedFilesBackup: mocks.importManagedFilesBackup,
  getManagedFilesQuota: mocks.getManagedFilesQuota
}));

vi.mock('$lib/authService.js', async () => {
  const { writable } = await import('svelte/store');
  const store = writable({
    user: { email: 'qa.user@example.com', name: 'QA User' },
    isLoggedIn: true,
    loading: false
  });
  return {
    authService: {
      subscribe: store.subscribe
    }
  };
});

function makeFiles() {
  return [
    {
      id: 'f1',
      userId: 'qa.user@example.com',
      feature: 'resume',
      jobId: 'job-1',
      filename: 'Amit_Resume_Seek.pdf',
      storedName: 'stored1',
      relativePath: 'storage/resume/job-1/stored1',
      sourceRoute: '/frontend-form',
      mimeType: 'application/pdf',
      size: 70_000,
      createdAt: '10',
      updatedAt: '10',
      tags: ['seed']
    },
    {
      id: 'f2',
      userId: 'qa.user@example.com',
      feature: 'cover-letter',
      jobId: 'job-1',
      filename: 'CoverLetter_Google.doc',
      storedName: 'stored2',
      relativePath: 'storage/cover-letter/job-1/stored2',
      sourceRoute: '/cover-letters',
      mimeType: 'application/msword',
      size: 190_000,
      createdAt: '11',
      updatedAt: '11',
      tags: ['generated']
    },
    {
      id: 'f3',
      userId: 'qa.user@example.com',
      feature: 'enhancement',
      jobId: 'job-2',
      filename: 'Resume_Enhanced_Meta.docx',
      storedName: 'stored3',
      relativePath: 'storage/enhancement/job-2/stored3',
      sourceRoute: '/resume-enhancement',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1_500_000,
      createdAt: '12',
      updatedAt: '12',
      tags: ['generated']
    }
  ];
}

describe('Files manager page', () => {
  let confirmMock: ReturnType<typeof vi.fn>;
  let alertMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset());
    mocks.getManagedFiles.mockResolvedValue(makeFiles());
    mocks.previewManagedFile.mockResolvedValue('Preview content for selected file');
    mocks.deleteManagedFiles.mockResolvedValue(2);
    mocks.moveManagedFiles.mockResolvedValue(2);
    mocks.openManagedFile.mockResolvedValue('Opened');
    mocks.openManagedFileParent.mockResolvedValue('Opened folder');
    mocks.exportManagedFilesBackup.mockResolvedValue('/tmp/finalboss-backup');
    mocks.importManagedFilesBackup.mockResolvedValue(2);
    mocks.getManagedFilesQuota.mockResolvedValue({
      usedFileCount: 3,
      maxFileCount: 10000,
      usedBytes: 1_760_000,
      maxBytes: 2_147_483_648,
      fileCountUsagePercent: 0.03,
      bytesUsagePercent: 0.08,
      warningLevel: 'ok'
    });
    confirmMock = vi.fn(() => true);
    alertMock = vi.fn(() => undefined);
    (globalThis as any).confirm = confirmMock;
    (globalThis as any).alert = alertMock;
  });

  it('loads and groups files by job', async () => {
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());
    await screen.findByText('Job Group: job-1');
    expect(mocks.getManagedFilesQuota).toHaveBeenCalledWith('qa.user@example.com');
    expect(screen.getByText('Job Group: job-1')).toBeInTheDocument();
    expect(screen.getByText('Job Group: job-2')).toBeInTheDocument();
  });

  it('shows quota warning banner when usage is above threshold', async () => {
    mocks.getManagedFilesQuota.mockResolvedValueOnce({
      usedFileCount: 8600,
      maxFileCount: 10000,
      usedBytes: 1_200_000_000,
      maxBytes: 2_147_483_648,
      fileCountUsagePercent: 86,
      bytesUsagePercent: 55,
      warningLevel: 'warning'
    });
    render(FilesPage);
    await waitFor(() => expect(screen.getByText('Quota warning (85%+ usage)')).toBeInTheDocument());
  });

  it('applies search, feature, and size filters', async () => {
    const user = userEvent.setup();
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());

    const searchInput = screen.getByPlaceholderText('Search filename/job/source...');
    await user.type(searchInput, 'google');
    expect(screen.getByText('CoverLetter_Google.doc')).toBeInTheDocument();
    expect(screen.queryByText('Amit_Resume_Seek.pdf')).not.toBeInTheDocument();

    await user.clear(searchInput);

    const featureSelect = screen.getByDisplayValue('All features');
    await user.selectOptions(featureSelect, 'resume');
    expect(screen.getByText('Amit_Resume_Seek.pdf')).toBeInTheDocument();
    expect(screen.queryByText('CoverLetter_Google.doc')).not.toBeInTheDocument();

    await user.selectOptions(featureSelect, 'all');
    const sizeSelect = screen.getByDisplayValue('All sizes');
    await user.selectOptions(sizeSelect, 'large');
    expect(screen.getByText('Resume_Enhanced_Meta.docx')).toBeInTheDocument();
    expect(screen.queryByText('Amit_Resume_Seek.pdf')).not.toBeInTheDocument();
  });

  it('runs bulk delete for selected visible files', async () => {
    const user = userEvent.setup();
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Toggle Select Visible' }));
    await user.click(screen.getByRole('button', { name: 'Bulk Delete' }));

    expect(confirmMock).toHaveBeenCalled();
    expect(mocks.deleteManagedFiles).toHaveBeenCalledWith('qa.user@example.com', expect.arrayContaining(['f1', 'f2', 'f3']));
  });

  it('runs bulk move for selected files', async () => {
    const user = userEvent.setup();
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Toggle Select Visible' }));
    const moveFeatureSelect = screen.getByDisplayValue('other');
    await user.selectOptions(moveFeatureSelect, 'enhancement');
    const moveJobInput = screen.getByPlaceholderText('target jobId (optional)');
    await user.type(moveJobInput, 'job-99');
    await user.click(screen.getByRole('button', { name: 'Bulk Move' }));

    expect(mocks.moveManagedFiles).toHaveBeenCalledWith(
      'qa.user@example.com',
      expect.arrayContaining(['f1', 'f2', 'f3']),
      'enhancement',
      'job-99'
    );
  });

  it('supports preview, open file, and open folder actions', async () => {
    const user = userEvent.setup();
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());
    await screen.findByText('Job Group: job-1');

    const previewButtons = screen.getAllByRole('button', { name: 'Preview' });
    await user.click(previewButtons[0]);
    await waitFor(() => expect(mocks.previewManagedFile).toHaveBeenCalled());
    expect(screen.getByText('Preview content for selected file')).toBeInTheDocument();

    const openButtons = screen.getAllByRole('button', { name: 'Open' });
    await user.click(openButtons[0]);
    expect(mocks.openManagedFile).toHaveBeenCalled();

    const folderButtons = screen.getAllByRole('button', { name: 'Folder' });
    await user.click(folderButtons[0]);
    expect(mocks.openManagedFileParent).toHaveBeenCalled();
  });

  it('supports export and import backup operations', async () => {
    const user = userEvent.setup();
    render(FilesPage);
    await waitFor(() => expect(mocks.getManagedFiles).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Export Backup' }));
    expect(mocks.exportManagedFilesBackup).toHaveBeenCalledWith('qa.user@example.com');

    const importInput = screen.getByPlaceholderText('backup folder path to import');
    await user.type(importInput, '/tmp/finalboss-backup');
    await user.click(screen.getByRole('button', { name: 'Import Backup' }));
    expect(mocks.importManagedFilesBackup).toHaveBeenCalledWith('qa.user@example.com', '/tmp/finalboss-backup');
  });

});
