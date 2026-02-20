import type { ManagedFileEntry } from './file-manager';

export type SizeFilter = 'all' | 'small' | 'medium' | 'large';

export function matchesSizeFilter(file: ManagedFileEntry, sizeFilter: SizeFilter): boolean {
  if (sizeFilter === 'all') return true;
  if (sizeFilter === 'small') return file.size < 100 * 1024;
  if (sizeFilter === 'medium') return file.size >= 100 * 1024 && file.size < 1024 * 1024;
  return file.size >= 1024 * 1024;
}

export function filterManagedFiles(
  files: ManagedFileEntry[],
  search: string,
  feature: string,
  sizeFilter: SizeFilter
): ManagedFileEntry[] {
  const q = search.trim().toLowerCase();
  return files.filter((file) => {
    const featureOk = feature === 'all' || file.feature === feature;
    const searchOk =
      q.length === 0 ||
      file.filename.toLowerCase().includes(q) ||
      (file.jobId || '').toLowerCase().includes(q) ||
      (file.sourceRoute || '').toLowerCase().includes(q);
    return featureOk && searchOk && matchesSizeFilter(file, sizeFilter);
  });
}

export function groupManagedFilesByJob(files: ManagedFileEntry[]): Map<string, ManagedFileEntry[]> {
  const groups = new Map<string, ManagedFileEntry[]>();
  for (const file of files) {
    const key = file.jobId?.trim() || 'ungrouped';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }
  for (const [group, entries] of groups.entries()) {
    groups.set(
      group,
      [...entries].sort((a, b) => {
        const at = Number(a.updatedAt || 0);
        const bt = Number(b.updatedAt || 0);
        return bt - at;
      })
    );
  }
  return groups;
}
