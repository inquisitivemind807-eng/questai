<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { authService } from '$lib/authService.js';
  import {
    deleteManagedFiles,
    exportManagedFilesBackup,
    getManagedFiles,
    getManagedFilesQuota,
    importManagedFilesBackup,
    moveManagedFiles,
    openManagedFile,
    openManagedFileParent,
    previewManagedFile,
    type ManagedFileEntry,
    type ManagedFilesQuotaInfo
  } from '$lib/file-manager';
  import { filterManagedFiles, groupManagedFilesByJob, type SizeFilter } from '$lib/file-manager-utils';

  let user: any = null;
  let loading = false;
  let error = '';
  let files: ManagedFileEntry[] = [];
  let search = '';
  let featureFilter = 'all';
  let sizeFilter: SizeFilter = 'all';
  let selectedIds = new Set<string>();
  let previewText = '';
  let previewFileName = '';
  let actionMessage = '';
  let importPath = '';
  let moveTargetFeature = 'other';
  let moveTargetJobId = '';
  let quota: ManagedFilesQuotaInfo | null = null;

  $: filtered = filterManagedFiles(files, search, featureFilter, sizeFilter);
  $: grouped = groupManagedFilesByJob(filtered);
  $: groupList = Array.from(grouped.entries()).map(([group, entries]) => ({ group, entries }));
  $: selectedCount = selectedIds.size;

  onMount(async () => {
    if (!$authService.isLoggedIn) {
      goto('/login');
      return;
    }
    user = $authService.user;
    await loadFiles();
  });

  async function loadFiles() {
    if (!user?.email) return;
    loading = true;
    error = '';
    try {
      files = await getManagedFiles({ userId: user.email });
      quota = await getManagedFilesQuota(user.email);
    } catch (err: any) {
      error = err?.message || 'Failed to load managed files.';
    } finally {
      loading = false;
    }
  }

  function toggleSelection(id: string) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = new Set(selectedIds);
  }

  function toggleAllVisible() {
    const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));
    if (allVisibleSelected) {
      for (const file of filtered) selectedIds.delete(file.id);
    } else {
      for (const file of filtered) selectedIds.add(file.id);
    }
    selectedIds = new Set(selectedIds);
  }

  async function doPreview(file: ManagedFileEntry) {
    try {
      previewText = await previewManagedFile(user.email, file.id, 10000);
      previewFileName = file.filename;
    } catch (err: any) {
      previewFileName = file.filename;
      previewText = `Preview unavailable: ${err?.message || err}`;
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected file(s)?`)) return;
    const count = await deleteManagedFiles(user.email, [...selectedIds]);
    actionMessage = `Deleted ${count} file(s).`;
    selectedIds = new Set();
    previewText = '';
    await loadFiles();
  }

  async function bulkMove() {
    if (selectedIds.size === 0) return;
    const count = await moveManagedFiles(
      user.email,
      [...selectedIds],
      moveTargetFeature,
      moveTargetJobId.trim() || undefined
    );
    actionMessage = `Moved ${count} file(s) to ${moveTargetFeature}.`;
    selectedIds = new Set();
    await loadFiles();
  }

  async function exportBackup() {
    const backupPath = await exportManagedFilesBackup(user.email);
    actionMessage = `Backup exported to: ${backupPath}`;
  }

  async function importBackup() {
    if (!importPath.trim()) {
      alert('Enter backup folder path first.');
      return;
    }
    const count = await importManagedFilesBackup(user.email, importPath.trim());
    actionMessage = `Imported ${count} file(s) from backup.`;
    await loadFiles();
  }

  function formatBytes(size: number): string {
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = size;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatPercent(value: number): string {
    return `${Math.min(999.9, value).toFixed(1)}%`;
  }
</script>

<main class="container mx-auto p-6">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold">Files Manager</h1>
      <p class="text-sm opacity-70">Local desktop files grouped by job and feature.</p>
    </div>
    <button class="btn btn-outline" on:click={loadFiles} disabled={loading}>Refresh</button>
  </div>

  {#if actionMessage}
    <div class="alert alert-success mb-4">{actionMessage}</div>
  {/if}
  {#if error}
    <div class="alert alert-error mb-4">{error}</div>
  {/if}
  {#if quota}
    {#if quota.warningLevel === 'critical'}
      <div class="alert alert-error mb-4">
        <div>
          <div class="font-semibold">Storage quota exceeded</div>
          <div class="text-sm">
            Files: {quota.usedFileCount}/{quota.maxFileCount} ({formatPercent(quota.fileCountUsagePercent)}) |
            Size: {formatBytes(quota.usedBytes)}/{formatBytes(quota.maxBytes)} ({formatPercent(quota.bytesUsagePercent)})
          </div>
        </div>
      </div>
    {:else if quota.warningLevel === 'warning'}
      <div class="alert alert-warning mb-4">
        <div>
          <div class="font-semibold">Quota warning (85%+ usage)</div>
          <div class="text-sm">
            Files: {quota.usedFileCount}/{quota.maxFileCount} ({formatPercent(quota.fileCountUsagePercent)}) |
            Size: {formatBytes(quota.usedBytes)}/{formatBytes(quota.maxBytes)} ({formatPercent(quota.bytesUsagePercent)})
          </div>
        </div>
      </div>
    {:else}
      <div class="alert alert-info mb-4">
        <div class="text-sm">
          Files: {quota.usedFileCount}/{quota.maxFileCount} ({formatPercent(quota.fileCountUsagePercent)}) |
          Size: {formatBytes(quota.usedBytes)}/{formatBytes(quota.maxBytes)} ({formatPercent(quota.bytesUsagePercent)})
        </div>
      </div>
    {/if}
  {/if}

  <div class="card bg-base-100 shadow mb-5">
    <div class="card-body grid grid-cols-1 md:grid-cols-4 gap-3">
      <input class="input input-bordered" placeholder="Search filename/job/source..." bind:value={search} />
      <select class="select select-bordered" bind:value={featureFilter}>
        <option value="all">All features</option>
        <option value="resume">Resume</option>
        <option value="cover-letter">Cover Letter</option>
        <option value="enhancement">Enhancement</option>
        <option value="other">Other</option>
      </select>
      <select class="select select-bordered" bind:value={sizeFilter}>
        <option value="all">All sizes</option>
        <option value="small">Small (&lt;100 KB)</option>
        <option value="medium">Medium (100 KB - 1 MB)</option>
        <option value="large">Large (&gt;=1 MB)</option>
      </select>
      <button class="btn btn-outline" on:click={toggleAllVisible}>Toggle Select Visible</button>
    </div>
  </div>

  <div class="card bg-base-100 shadow mb-5">
    <div class="card-body">
      <div class="flex flex-wrap gap-2 items-center">
        <span class="badge badge-neutral">Selected: {selectedCount}</span>
        <button class="btn btn-sm btn-error" on:click={bulkDelete} disabled={selectedCount === 0}>Bulk Delete</button>
        <select class="select select-sm select-bordered" bind:value={moveTargetFeature}>
          <option value="resume">resume</option>
          <option value="cover-letter">cover-letter</option>
          <option value="enhancement">enhancement</option>
          <option value="other">other</option>
        </select>
        <input class="input input-sm input-bordered" placeholder="target jobId (optional)" bind:value={moveTargetJobId} />
        <button class="btn btn-sm btn-primary" on:click={bulkMove} disabled={selectedCount === 0}>Bulk Move</button>
      </div>
      <div class="divider my-2"></div>
      <div class="flex flex-wrap gap-2 items-center">
        <button class="btn btn-sm btn-secondary" on:click={exportBackup}>Export Backup</button>
        <input class="input input-sm input-bordered flex-1 min-w-[260px]" placeholder="backup folder path to import" bind:value={importPath} />
        <button class="btn btn-sm btn-accent" on:click={importBackup}>Import Backup</button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-10"><span class="loading loading-spinner"></span></div>
  {:else if filtered.length === 0}
    <div class="alert">No files found for the current filters.</div>
  {:else}
    {#each groupList as item}
      <div class="card bg-base-100 shadow mb-4">
        <div class="card-body">
          <h2 class="card-title">Job Group: {item.group}</h2>
          <div class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Feature</th>
                  <th>Size</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each item.entries as file}
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        checked={selectedIds.has(file.id)}
                        on:change={() => toggleSelection(file.id)}
                      />
                    </td>
                    <td>{file.filename}</td>
                    <td><span class="badge badge-outline">{file.feature}</span></td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{file.updatedAt}</td>
                    <td class="flex gap-1">
                      <button class="btn btn-xs" on:click={() => doPreview(file)}>Preview</button>
                      <button class="btn btn-xs" on:click={() => openManagedFile(user.email, file.id)}>Open</button>
                      <button class="btn btn-xs" on:click={() => openManagedFileParent(user.email, file.id)}>Folder</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/each}
  {/if}

  {#if previewText}
    <div class="card bg-base-100 shadow mt-5">
      <div class="card-body">
        <h3 class="card-title">Preview: {previewFileName}</h3>
        <pre class="whitespace-pre-wrap max-h-96 overflow-auto">{previewText}</pre>
      </div>
    </div>
  {/if}
</main>
