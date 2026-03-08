import fs from 'fs';
import path from 'path';

const APP_NAME = 'FinalBoss';
const ALLOWED_RESUME_EXTENSIONS = ['.doc', '.docx', '.pdf'];

type ManagedFileEntry = {
  id: string;
  feature: string;
  filename: string;
  relative_path?: string;
  relativePath?: string;
  updated_at?: string;
  updatedAt?: string;
};

type ManagedFileIndex = {
  version: number;
  entries: ManagedFileEntry[];
};

function sanitizeSegment(input: string): string {
  const raw = String(input || '');
  let out = '';
  for (const ch of raw) {
    if (/^[a-zA-Z0-9._-]$/.test(ch)) out += ch;
    else out += '_';
  }
  const trimmed = out.replace(/^_+|_+$/g, '');
  return trimmed || 'unknown';
}

function getAppDataRoot(): string {
  const home = process.env.HOME || '';
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  const base = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(base, APP_NAME.toLowerCase());
}

function getUserRoot(userId: string): string {
  return path.join(getAppDataRoot(), 'users', sanitizeSegment(userId));
}

function getIndexPath(userId: string): string {
  return path.join(getUserRoot(userId), 'index', 'files-index.json');
}

function isSupportedResumeFile(name: string): boolean {
  const lower = String(name || '').toLowerCase();
  return ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function loadIndex(userId: string): ManagedFileIndex {
  const indexPath = getIndexPath(userId);
  if (!fs.existsSync(indexPath)) {
    return { version: 1, entries: [] };
  }
  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    version: Number(parsed?.version || 1),
    entries: Array.isArray(parsed?.entries) ? parsed.entries : []
  };
}

function resolveEntryPath(userId: string, entry: ManagedFileEntry): string {
  const userRoot = getUserRoot(userId);
  const rel = String(entry.relativePath || entry.relative_path || '');
  if (!rel || path.isAbsolute(rel)) {
    throw new Error('Managed file path must be relative');
  }
  const normalizedRel = path.normalize(rel.split('\\').join('/')).split('/').join(path.sep);
  const parts = normalizedRel.split(path.sep).filter(Boolean);
  const allowedRoots = new Set(['storage', 'resumes']);
  if (parts.length === 0 || !allowedRoots.has(parts[0]) || parts.includes('..')) {
    throw new Error('Invalid managed file path');
  }
  const full = path.join(userRoot, normalizedRel);
  if (!full.startsWith(userRoot)) {
    throw new Error('Managed file path escaped user root');
  }
  return full;
}

function resolvePreferredTextPath(fullPath: string): string {
  const ext = path.extname(fullPath).toLowerCase();
  if (ext === '.txt') return fullPath;
  const sidecarTxt = fullPath.slice(0, fullPath.length - ext.length) + '.txt';
  if (fs.existsSync(sidecarTxt)) {
    return sidecarTxt;
  }
  return fullPath;
}

function sortByUpdatedDesc(a: ManagedFileEntry, b: ManagedFileEntry): number {
  const aTs = Number(a.updatedAt || a.updated_at || 0);
  const bTs = Number(b.updatedAt || b.updated_at || 0);
  return bTs - aTs;
}

export function listCanonicalResumeNames(userId: string): string[] {
  const index = loadIndex(userId);
  return index.entries
    .filter((entry) => entry.feature === 'resume' && isSupportedResumeFile(entry.filename))
    .sort(sortByUpdatedDesc)
    .map((entry) => entry.filename);
}

export function readCanonicalResumeText(userId: string, preferredResumeFileName = ''): { filename: string; content: string } {
  if (!userId) {
    throw new Error('Missing userId. Cannot resolve canonical resume.');
  }
  const index = loadIndex(userId);
  const candidates = index.entries
    .filter((entry) => entry.feature === 'resume' && isSupportedResumeFile(entry.filename))
    .sort(sortByUpdatedDesc);

  if (candidates.length === 0) {
    throw new Error(`No canonical .doc/.docx/.pdf resume files found for userId ${userId}`);
  }

  const preferred =
    preferredResumeFileName
      ? candidates.find((entry) => entry.filename === preferredResumeFileName)
      : undefined;
  const fallback = candidates.find((entry) => entry.filename.toLowerCase().includes('resume')) || candidates[0];
  const orderedCandidates: ManagedFileEntry[] = [];
  if (preferred) orderedCandidates.push(preferred);
  for (const entry of candidates) {
    if (!orderedCandidates.includes(entry)) orderedCandidates.push(entry);
  }
  if (!orderedCandidates.includes(fallback)) orderedCandidates.push(fallback);

  let lastError: unknown = null;
  for (const entry of orderedCandidates) {
    try {
      const fullPath = resolveEntryPath(userId, entry);
      const readablePath = resolvePreferredTextPath(fullPath);
      if (!fs.existsSync(readablePath)) {
        throw new Error(`Resume file not found at ${readablePath}`);
      }
      const content = fs.readFileSync(readablePath, 'utf8').trim();
      if (!content) {
        throw new Error(`Canonical resume file ${entry.filename} is empty for userId ${userId}`);
      }
      return { filename: entry.filename, content };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw new Error(
    `Failed to read canonical resume for userId ${userId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
