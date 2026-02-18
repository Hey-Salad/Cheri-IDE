import { promises as fs } from 'node:fs';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

type BaselineEntry = {
  relPath: string;
  size: number;
  mtimeMs: number;
  mode: number;
  sha256: string;
  textLike: boolean;
  lineCount: number | null;
  stored: boolean;
};

type BaselineManifest = {
  version: 1;
  createdAt: number;
  workspaceRoot: string;
  entries: Record<string, BaselineEntry>;
  totals: { files: number; bytesStored: number; filesStored: number; filesSkipped: number };
};

type ChangeFile = { path: string; status: string; additions?: number | null; deletions?: number | null };

const BASELINE_ROOT = path.join(os.homedir(), '.cheri', 'baselines');
const MANIFEST_NAME = 'baseline-manifest.json';
const FILES_DIR_NAME = 'files';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'release',
  'out',
  'build',
  '.next',
  '.cache',
  '.turbo',
  '.vite',
  '.parcel-cache',
]);

const DEFAULT_IGNORED_FILES = new Set([
  '.DS_Store',
]);

type IgnoreRule = { negated: boolean; dirOnly: boolean; matcher: (relPath: string, isDir: boolean) => boolean };

function isHiddenDirPath(relPath: string, isDir: boolean): boolean {
  const normalized = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.') return false;
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return false;
  const last = parts[parts.length - 1] || '';
  if (isDir && last.startsWith('.') && last !== '.' && last !== '..') return true;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i] || '';
    if (seg.startsWith('.') && seg !== '.' && seg !== '..') return true;
  }
  return false;
}

function globToRegex(source: string): RegExp {
  let s = source.replace(/\\/g, '/');
  // Escape regex specials, then restore glob tokens.
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // ** => .*
  s = s.replace(/\\\*\\\*/g, '.*');
  // * => [^/]*, ? => [^/]
  s = s.replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]');
  return new RegExp(`^${s}$`);
}

function parseRootGitignoreFile(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  for (const rawLine of lines) {
    const line = String(rawLine ?? '');
    if (!line) continue;
    // Comments: treat leading # as comment. (Best-effort; doesn't handle escaped #)
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    let pat = trimmed;
    let negated = false;
    if (pat.startsWith('!')) {
      negated = true;
      pat = pat.slice(1);
    }
    pat = pat.trim();
    if (!pat) continue;

    const dirOnly = pat.endsWith('/');
    if (dirOnly) pat = pat.replace(/\/+$/, '');
    const anchored = pat.startsWith('/');
    if (anchored) pat = pat.replace(/^\/+/, '');
    if (!pat) continue;

    const hasSlash = pat.includes('/');
    const baseRegex = globToRegex(pat);

    const matcher = (relPath: string, isDir: boolean): boolean => {
      const normalized = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!normalized || normalized === '.') return false;
      const basename = normalized.split('/').pop() || normalized;
      const candidatePaths: string[] = [];

      if (anchored) {
        candidatePaths.push(normalized);
      } else if (hasSlash) {
        // Unanchored path pattern: match anywhere.
        candidatePaths.push(normalized);
        // Also allow matching against subpath suffixes.
        const parts = normalized.split('/');
        for (let i = 1; i < parts.length; i++) {
          candidatePaths.push(parts.slice(i).join('/'));
        }
      } else {
        // No slash: match on basename.
        candidatePaths.push(basename);
      }

      const matched = candidatePaths.some((p) => baseRegex.test(p));
      if (!matched) return false;
      if (!dirOnly) return true;
      return isDir || normalized.startsWith(`${pat.replace(/\\/g, '/').replace(/^\/+/, '')}/`);
    };

    rules.push({ negated, dirOnly, matcher });
  }
  return rules;
}

async function loadRootGitignoreRules(workspaceRoot: string): Promise<IgnoreRule[]> {
  const ignorePath = path.join(path.resolve(workspaceRoot), '.gitignore');
  if (!fsSync.existsSync(ignorePath)) return [];
  try {
    const raw = await fs.readFile(ignorePath, 'utf8');
    return parseRootGitignoreFile(raw);
  } catch {
    return [];
  }
}

function buildIgnoreMatcher(
  workspaceRoot: string,
  rules: IgnoreRule[],
): (relPath: string, isDir: boolean) => boolean {
  return (relPath: string, isDir: boolean): boolean => {
    const normalized = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized === '.') return false;
    if (isHiddenDirPath(normalized, isDir)) return true;
    if (shouldIgnore(normalized)) return true;
    let ignored = false;
    for (const rule of rules) {
      if (!rule || typeof rule.matcher !== 'function') continue;
      let matched = rule.matcher(normalized, isDir);
      if (!matched && rule.dirOnly && !isDir) {
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length > 1) {
          let prefix = '';
          for (let i = 0; i < parts.length - 1; i++) {
            prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
            if (rule.matcher(prefix, true)) { matched = true; break; }
          }
        }
      }
      if (!matched) continue;
      ignored = !rule.negated;
    }
    return ignored;
  };
}

const TEXT_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonl',
  '.md', '.txt', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.gql',
  '.gitignore', '.gitattributes',
]);

const BINARY_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.pdf',
  '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.wav',
  '.woff', '.woff2', '.ttf', '.otf',
  '.dmg', '.pkg',
  '.app', '.exe', '.dll', '.so', '.bin', '.class', '.o', '.obj', '.wasm',
]);

const MAX_FILE_BYTES_TO_STORE = 15 * 1024 * 1024; // 15MB per file
const MAX_TOTAL_BYTES_TO_STORE = 300 * 1024 * 1024; // 300MB per run baseline

function workspaceHash(workspaceRoot: string): string {
  const normalized = path.resolve(workspaceRoot || process.cwd());
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function sanitizeSessionId(sessionId: string): string {
  const raw = String(sessionId ?? '').trim();
  if (!raw) return 'unknown';
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (safe && safe.length <= 160) return safe;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function sanitizeRunId(runId: string): string {
  const raw = String(runId ?? '').trim();
  if (!raw) return 'unknown-run';
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (safe && safe.length <= 200) return safe;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function sessionRootDirFor(workspaceRoot: string, sessionId: string): string {
  const ws = workspaceHash(workspaceRoot);
  const sid = sanitizeSessionId(sessionId);
  return path.join(BASELINE_ROOT, ws, sid);
}

function baselineDirFor(workspaceRoot: string, sessionId: string, runId: string): string {
  const root = sessionRootDirFor(workspaceRoot, sessionId);
  const rid = sanitizeRunId(runId);
  return path.join(root, rid);
}

function latestRunPathFor(workspaceRoot: string, sessionId: string): string {
  return path.join(sessionRootDirFor(workspaceRoot, sessionId), 'latest.json');
}

function manifestPathFor(baselineDir: string): string {
  return path.join(baselineDir, MANIFEST_NAME);
}

function filesRootFor(baselineDir: string): string {
  return path.join(baselineDir, FILES_DIR_NAME);
}

function resolvePathInside(base: string, relativePath: string): { ok: boolean; abs?: string; rel?: string; error?: string } {
  const rel = relativePath && relativePath !== '.' ? relativePath : '';
  const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(base, rel);
  const normalizedBase = path.resolve(base);
  const relOut = path.relative(normalizedBase, abs);
  const inside = !(relOut.startsWith('..') || (path.isAbsolute(relOut) && relOut !== '.'));
  if (!inside) return { ok: false, error: 'Path escapes workspace' };
  const safeRel = relOut || '.';
  return { ok: true, abs, rel: safeRel };
}

async function sha256File(absPath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = fsSync.createReadStream(absPath);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function readSample(absPath: string, bytes = 4096): Promise<Buffer> {
  const fd = await fs.open(absPath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const res = await fd.read(buf, 0, bytes, 0);
    return buf.subarray(0, res.bytesRead);
  } finally {
    try { await fd.close(); } catch {}
  }
}

function isTextLikeFile(filePath: string, sample: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(ext)) return true;
  if (BINARY_FILE_EXTENSIONS.has(ext)) return false;
  if (sample.length === 0) return true;
  let suspicious = 0;
  const sampleLength = Math.min(sample.length, 4096);
  for (let i = 0; i < sampleLength; i++) {
    const byte = sample[i];
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) suspicious += 1;
  }
  return suspicious / sampleLength <= 0.3;
}

async function countFileLines(absPath: string): Promise<number> {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    const normalized = raw.replace(/\r\n/g, '\n');
    if (!normalized) return 0;
    const segments = normalized.split('\n');
    return normalized.endsWith('\n') ? segments.length - 1 : segments.length;
  } catch {
    return 0;
  }
}

function shouldIgnore(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized || normalized === '.') return false;
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (DEFAULT_IGNORED_FILES.has(parts[parts.length - 1] || '')) return true;
  for (const p of parts) {
    if (DEFAULT_IGNORED_DIRS.has(p)) return true;
  }
  return false;
}

async function walkWorkspaceFiles(
  workspaceRoot: string,
  onFile: (relPath: string, absPath: string, st: fsSync.Stats) => Promise<void>,
  opts?: { shouldIgnore?: (relPath: string, isDir: boolean) => boolean },
): Promise<void> {
  const rootAbs = path.resolve(workspaceRoot);
  const visit = async (dirRel: string): Promise<void> => {
    const safe = resolvePathInside(rootAbs, dirRel);
    if (!safe.ok || !safe.abs) return;
    let dirents: fsSync.Dirent[];
    try {
      dirents = await fs.readdir(safe.abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const de of dirents) {
      const name = de.name;
      if (!name || name === '.' || name === '..') continue;
      const nextRel = dirRel === '.' ? name : path.posix.join(dirRel.replace(/\\/g, '/'), name);
      const nextSafe = resolvePathInside(rootAbs, nextRel);
      if (!nextSafe.ok || !nextSafe.abs) continue;
      let st: fsSync.Stats;
      try { st = await fs.lstat(nextSafe.abs); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (opts?.shouldIgnore?.(nextRel, true)) continue;
        await visit(nextRel);
        continue;
      }
      if (!st.isFile()) continue;
      if (opts?.shouldIgnore?.(nextRel, false)) continue;
      await onFile(nextRel, nextSafe.abs, st);
    }
  };
  await visit('.');
}

async function loadManifest(workspaceRoot: string, sessionId: string, runId: string): Promise<BaselineManifest | null> {
  const baselineDir = baselineDirFor(workspaceRoot, sessionId, runId);
  const manifestPath = manifestPathFor(baselineDir);
  if (!fsSync.existsSync(manifestPath)) return null;
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Number(parsed.version) !== 1) return null;
    const entriesRaw = (parsed as any).entries;
    if (!entriesRaw || typeof entriesRaw !== 'object') return null;
    return parsed as BaselineManifest;
  } catch {
    return null;
  }
}

async function writeManifest(workspaceRoot: string, sessionId: string, runId: string, manifest: BaselineManifest): Promise<void> {
  const baselineDir = baselineDirFor(workspaceRoot, sessionId, runId);
  await fs.mkdir(baselineDir, { recursive: true });
  await fs.writeFile(manifestPathFor(baselineDir), JSON.stringify(manifest, null, 2), 'utf8');
}

function storedCopyPath(baselineDir: string, relPath: string): string {
  const safeRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(filesRootFor(baselineDir), safeRel);
}

async function readLatestRunId(workspaceRoot: string, sessionId: string): Promise<string | null> {
  const latestPath = latestRunPathFor(workspaceRoot, sessionId);
  if (!fsSync.existsSync(latestPath)) return null;
  try {
    const raw = await fs.readFile(latestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const runId = typeof parsed?.runId === 'string' ? parsed.runId.trim() : '';
    return runId ? runId : null;
  } catch {
    return null;
  }
}

async function writeLatestRunId(workspaceRoot: string, sessionId: string, runId: string): Promise<void> {
  const latestPath = latestRunPathFor(workspaceRoot, sessionId);
  await fs.mkdir(path.dirname(latestPath), { recursive: true });
  await fs.writeFile(latestPath, JSON.stringify({ runId: sanitizeRunId(runId), updatedAt: Date.now() }, null, 2), 'utf8');
}

async function deleteOtherRunBaselines(workspaceRoot: string, sessionId: string, keepRunId: string): Promise<void> {
  const root = sessionRootDirFor(workspaceRoot, sessionId);
  const keep = sanitizeRunId(keepRunId);
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    for (const de of dirents) {
      if (!de.isDirectory()) continue;
      if (de.name === keep) continue;
      try { await fs.rm(path.join(root, de.name), { force: true, recursive: true }); } catch {}
    }
  } catch { }
}

function resolveRunIdOrLatest(workspaceRoot: string, sessionId: string, runId?: string): Promise<string | null> {
  const rid = typeof runId === 'string' && runId.trim() ? sanitizeRunId(runId.trim()) : '';
  if (rid) return Promise.resolve(rid);
  return readLatestRunId(workspaceRoot, sessionId);
}

export async function ensureWorkspaceBaseline(
  workspaceRoot: string,
  sessionId: string,
  runId: string,
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const rid = sanitizeRunId(runId);
  const existing = await loadManifest(workspaceRoot, sessionId, rid);
  if (existing) return { ok: true, created: false };
  const res = await captureWorkspaceBaseline(workspaceRoot, sessionId, rid);
  if (!res.ok) return res;
  return { ok: true, created: true };
}

export async function captureWorkspaceBaseline(
  workspaceRoot: string,
  sessionId: string,
  runId: string,
): Promise<{ ok: boolean; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const rid = sanitizeRunId(runId);
  const ignoreRules = await loadRootGitignoreRules(rootAbs);
  const shouldIgnorePath = buildIgnoreMatcher(rootAbs, ignoreRules);
  const baselineDir = baselineDirFor(rootAbs, sessionId, rid);
  const filesRoot = filesRootFor(baselineDir);
  try {
    await fs.mkdir(filesRoot, { recursive: true });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'Failed to create baseline directory') };
  }

  const entries: Record<string, BaselineEntry> = {};
  let bytesStored = 0;
  let filesStored = 0;
  let filesSkipped = 0;

  const createdAt = Date.now();

  await walkWorkspaceFiles(rootAbs, async (relPath, absPath, st) => {
    if (bytesStored >= MAX_TOTAL_BYTES_TO_STORE) {
      filesSkipped += 1;
      return;
    }
    const size = Math.max(0, Number(st.size) || 0);
    const mtimeMs = Number(st.mtimeMs) || 0;
    const mode = Number(st.mode) || 0;
    let sample: Buffer;
    try { sample = await readSample(absPath, 4096); } catch { sample = Buffer.alloc(0); }
    const textLike = isTextLikeFile(absPath, sample);
    let lineCount: number | null = null;
    if (textLike) {
      lineCount = await countFileLines(absPath);
    }
    let sha256 = '';
    try { sha256 = await sha256File(absPath); } catch { sha256 = ''; }

    let stored = false;
    if (size <= MAX_FILE_BYTES_TO_STORE && (bytesStored + size) <= MAX_TOTAL_BYTES_TO_STORE) {
      const dest = storedCopyPath(baselineDir, relPath);
      try {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(absPath, dest);
        stored = true;
        bytesStored += size;
        filesStored += 1;
      } catch {
        stored = false;
        filesSkipped += 1;
      }
    } else {
      filesSkipped += 1;
    }

    entries[relPath] = { relPath, size, mtimeMs, mode, sha256, textLike, lineCount, stored };
  }, { shouldIgnore: shouldIgnorePath });

  const manifest: BaselineManifest = {
    version: 1,
    createdAt,
    workspaceRoot: rootAbs,
    entries,
    totals: {
      files: Object.keys(entries).length,
      bytesStored,
      filesStored,
      filesSkipped,
    },
  };

  try {
    await writeManifest(rootAbs, sessionId, rid, manifest);
    await writeLatestRunId(rootAbs, sessionId, rid);
    await deleteOtherRunBaselines(rootAbs, sessionId, rid);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'Failed to write baseline manifest') };
  }
}

export async function computeWorkspaceBaselineChanges(
  workspaceRoot: string,
  sessionId: string,
  runId?: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ ok: boolean; files?: ChangeFile[]; totals?: { files: number; additions: number; deletions: number }; fingerprint?: string; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const resolvedRunId = await resolveRunIdOrLatest(rootAbs, sessionId, runId);
  if (!resolvedRunId) return { ok: false, error: 'No baseline captured for this chat session yet.' };
  const latest = await readLatestRunId(rootAbs, sessionId);
  if (latest && latest !== resolvedRunId) return { ok: false, error: 'Only the latest run can be compared/undone.' };
  const manifest = await loadManifest(rootAbs, sessionId, resolvedRunId);
  if (!manifest) return { ok: false, error: 'No baseline captured for this chat session yet.' };

  const ignoreRules = await loadRootGitignoreRules(rootAbs);
  const shouldIgnorePath = buildIgnoreMatcher(rootAbs, ignoreRules);

  const baseline = manifest.entries || {};
  const seen = new Set<string>();
  const files: ChangeFile[] = [];
  let totalAdd = 0;
  let totalDel = 0;

  await walkWorkspaceFiles(rootAbs, async (relPath, absPath, st) => {
    seen.add(relPath);
    const baseEntry = baseline[relPath];
    if (!baseEntry) {
      const sample = await readSample(absPath, 4096).catch(() => Buffer.alloc(0));
      const textLike = isTextLikeFile(absPath, sample);
      const additions = textLike ? await countFileLines(absPath) : null;
      files.push({ path: relPath, status: 'A', additions: typeof additions === 'number' ? additions : null, deletions: 0 });
      if (typeof additions === 'number') totalAdd += additions;
      return;
    }

    const size = Math.max(0, Number(st.size) || 0);
    if (baseEntry.sha256 && size === baseEntry.size && Number(st.mtimeMs) === baseEntry.mtimeMs) {
      return;
    }

    const currentHash = await sha256File(absPath).catch(() => '');
    if (currentHash && baseEntry.sha256 && currentHash === baseEntry.sha256) {
      return;
    }

    let additions: number | null = null;
    let deletions: number | null = null;
    const sample = await readSample(absPath, 4096).catch(() => Buffer.alloc(0));
    const textLike = isTextLikeFile(absPath, sample);
    if (textLike) {
      let computed = false;
      if (baseEntry.stored) {
        const oldRes = await readBaselineStoredFileText(rootAbs, sessionId, resolvedRunId, relPath);
        const newRes = await safeReadText(absPath);
        if (oldRes.ok && newRes.ok) {
          const ops = myersDiffOps(
            splitLinesForDiff(oldRes.text ?? ''),
            splitLinesForDiff(newRes.text ?? ''),
            { maxEditDistance: MAX_MYERS_EDIT_DISTANCE },
          );
          if (ops) {
            const counts = countMyersOps(ops);
            additions = counts.additions;
            deletions = counts.deletions;
            computed = true;
          }
        }
      }

      if (!computed) {
        const currentLines = await countFileLines(absPath);
        const baseLines = typeof baseEntry.lineCount === 'number' ? baseEntry.lineCount : null;
        if (typeof baseLines === 'number') {
          additions = Math.max(0, currentLines - baseLines);
          deletions = Math.max(0, baseLines - currentLines);
        } else {
          additions = currentLines;
          deletions = 0;
        }
      }
    }
    files.push({ path: relPath, status: 'M', additions, deletions });
    if (typeof additions === 'number') totalAdd += additions;
    if (typeof deletions === 'number') totalDel += deletions;
  }, { shouldIgnore: shouldIgnorePath });

  for (const relPath of Object.keys(baseline)) {
    if (shouldIgnorePath(relPath, false)) continue;
    if (seen.has(relPath)) continue;
    const entry = baseline[relPath];
    if (!entry) continue;
    const deletions = typeof entry.lineCount === 'number' ? entry.lineCount : null;
    files.push({ path: relPath, status: 'D', additions: 0, deletions });
    if (typeof deletions === 'number') totalDel += deletions;
  }

  files.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  const totalFiles = files.length;
  const offset = Math.max(0, Math.floor(Number(opts?.offset) || 0));
  const limitRaw = opts?.limit === undefined ? 300 : Number(opts?.limit);
  const limit = Math.max(0, Math.floor(Number.isFinite(limitRaw) ? limitRaw : 300));
  const page = limit === 0 ? [] : files.slice(offset, offset + limit);
  const totals = { files: totalFiles, additions: totalAdd, deletions: totalDel };
  let fingerprint = '';
  try {
    const normalized = files
      .map((f) => ({
        path: f.path,
        status: f.status,
        additions: f.additions === null || f.additions === undefined ? null : Number(f.additions),
        deletions: f.deletions === null || f.deletions === undefined ? null : Number(f.deletions),
      }))
      .map((f) => ({
        ...f,
        additions: typeof f.additions === 'number' && Number.isFinite(f.additions) ? Math.max(0, Math.floor(f.additions)) : null,
        deletions: typeof f.deletions === 'number' && Number.isFinite(f.deletions) ? Math.max(0, Math.floor(f.deletions)) : null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
    fingerprint = createHash('sha256').update(JSON.stringify({ totals, files: normalized })).digest('hex');
  } catch {
    fingerprint = '';
  }
  return { ok: true, files: page, totals, fingerprint };
}

function computeSimpleUnifiedDiffLines(oldText: string, newText: string, contextLines = 3): { hunk: string[]; header: string } | null {
  const oldArr = oldText.replace(/\r\n/g, '\n').split('\n');
  const newArr = newText.replace(/\r\n/g, '\n').split('\n');

  let prefixLen = 0;
  while (prefixLen < oldArr.length && prefixLen < newArr.length && oldArr[prefixLen] === newArr[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < oldArr.length - prefixLen &&
    suffixLen < newArr.length - prefixLen &&
    oldArr[oldArr.length - 1 - suffixLen] === newArr[newArr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldChanged = oldArr.slice(prefixLen, Math.max(prefixLen, oldArr.length - suffixLen));
  const newChanged = newArr.slice(prefixLen, Math.max(prefixLen, newArr.length - suffixLen));
  if (oldChanged.length === 0 && newChanged.length === 0) return null;

  const contextBefore = Math.min(prefixLen, contextLines);
  const contextAfter = Math.min(suffixLen, contextLines);
  const oldStartIndex = Math.max(0, prefixLen - contextBefore);
  const newStartIndex = Math.max(0, prefixLen - contextBefore);

  const oldHunkLines = contextBefore + oldChanged.length + contextAfter;
  const newHunkLines = contextBefore + newChanged.length + contextAfter;

  const oldStart = oldStartIndex + 1;
  const newStart = newStartIndex + 1;
  const header = `@@ -${oldStart},${oldHunkLines} +${newStart},${newHunkLines} @@`;

  const hunk: string[] = [];
  for (let i = oldStartIndex; i < prefixLen; i++) {
    hunk.push(` ${oldArr[i] ?? ''}`);
  }
  for (const line of oldChanged) hunk.push(`-${line}`);
  for (const line of newChanged) hunk.push(`+${line}`);
  for (let i = oldArr.length - suffixLen; i < oldArr.length - suffixLen + contextAfter; i++) {
    hunk.push(` ${oldArr[i] ?? ''}`);
  }
  return { header, hunk };
}

type MyersOp = { type: 'equal' | 'insert' | 'delete'; line: string };

const MAX_MYERS_EDIT_DISTANCE = 4000;

function normalizeTextForDiff(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n');
}

function splitLinesForDiff(text: string): string[] {
  const normalized = normalizeTextForDiff(text);
  if (!normalized) return [];
  const parts = normalized.split('\n');
  if (normalized.endsWith('\n')) {
    // `a\nb\n` should be 2 lines, not 3.
    parts.pop();
  }
  return parts;
}

function myersDiffOps(
  oldLines: string[],
  newLines: string[],
  opts?: { maxEditDistance?: number },
): MyersOp[] | null {
  const a = Array.isArray(oldLines) ? oldLines : [];
  const b = Array.isArray(newLines) ? newLines : [];
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((line) => ({ type: 'insert', line }));
  if (m === 0) return a.map((line) => ({ type: 'delete', line }));

  const max = n + m;
  const maxEditDistance = Math.max(0, Math.floor(Number(opts?.maxEditDistance ?? 6000)));
  const maxD = Math.min(max, maxEditDistance || max);
  const offset = max;

  const v = new Int32Array(2 * max + 1);
  v.fill(-1);
  v[offset + 1] = 0;

  const trace: Int32Array[] = [];
  let reachedD: number | null = null;

  for (let d = 0; d <= maxD; d++) {
    // Snapshot `v` before this layer so backtracking can recover the path.
    const snap = new Int32Array(2 * d + 3); // k range [-d-1 .. d+1]
    for (let k = -d - 1; k <= d + 1; k++) {
      snap[k + d + 1] = v[offset + k];
    }
    trace.push(snap);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        reachedD = d;
        break;
      }
    }
    if (reachedD !== null) break;
  }

  if (reachedD === null) return null;

  const opsRev: MyersOp[] = [];
  let x = n;
  let y = m;

  for (let d = reachedD; d >= 0; d--) {
    const snap = trace[d];
    const get = (k: number): number => {
      // snap covers [-d-1..d+1]
      const idx = k + d + 1;
      if (idx < 0 || idx >= snap.length) return -1;
      return snap[idx];
    };

    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && get(k - 1) < get(k + 1))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = get(prevK);
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      opsRev.push({ type: 'equal', line: a[x - 1] ?? '' });
      x -= 1;
      y -= 1;
    }

    if (d === 0) break;

    if (x === prevX) {
      opsRev.push({ type: 'insert', line: b[y - 1] ?? '' });
      y -= 1;
    } else {
      opsRev.push({ type: 'delete', line: a[x - 1] ?? '' });
      x -= 1;
    }
  }

  opsRev.reverse();
  return opsRev;
}

function countMyersOps(ops: MyersOp[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (!op) continue;
    if (op.type === 'insert') additions += 1;
    else if (op.type === 'delete') deletions += 1;
  }
  return { additions, deletions };
}

type UnifiedHunk = { header: string; lines: string[] };

function buildUnifiedHunksFromOps(ops: MyersOp[], contextLines = 3): UnifiedHunk[] {
  const context = Math.max(0, Math.floor(Number(contextLines) || 0));
  if (!Array.isArray(ops) || ops.length === 0) return [];

  type Annot = {
    tag: ' ' | '+' | '-';
    text: string;
    oldPos: number;
    newPos: number;
    oldInc: number;
    newInc: number;
  };

  const annotated: Annot[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const op of ops) {
    if (!op) continue;
    if (op.type === 'equal') {
      annotated.push({ tag: ' ', text: op.line ?? '', oldPos: oldLine, newPos: newLine, oldInc: 1, newInc: 1 });
      oldLine += 1;
      newLine += 1;
      continue;
    }
    if (op.type === 'delete') {
      annotated.push({ tag: '-', text: op.line ?? '', oldPos: oldLine, newPos: newLine, oldInc: 1, newInc: 0 });
      oldLine += 1;
      continue;
    }
    annotated.push({ tag: '+', text: op.line ?? '', oldPos: oldLine, newPos: newLine, oldInc: 0, newInc: 1 });
    newLine += 1;
  }

  const changes: number[] = [];
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i]?.tag !== ' ') changes.push(i);
  }
  if (changes.length === 0) return [];

  const windows: Array<{ start: number; end: number }> = [];
  for (const idx of changes) {
    const start = Math.max(0, idx - context);
    const end = Math.min(annotated.length, idx + context + 1);
    if (end > start) windows.push({ start, end });
  }

  const merged: Array<{ start: number; end: number }> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ start: w.start, end: w.end });
    }
  }

  const hunks: UnifiedHunk[] = [];
  for (const w of merged) {
    const seg = annotated.slice(w.start, w.end);
    if (seg.length === 0) continue;
    const first = seg[0];
    let oldStart = first.oldPos;
    let newStart = first.newPos;
    let oldLen = 0;
    let newLen = 0;
    for (const line of seg) {
      oldLen += line.oldInc;
      newLen += line.newInc;
    }
    if (oldLen === 0) oldStart = Math.max(0, oldStart - 1);
    if (newLen === 0) newStart = Math.max(0, newStart - 1);
    const header = `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`;
    const lines = seg.map((l) => `${l.tag}${l.text ?? ''}`);
    hunks.push({ header, lines });
  }
  return hunks;
}

function computeUnifiedDiffFromText(
  oldText: string,
  newText: string,
  contextLines = 3,
): { hunks: UnifiedHunk[]; additions: number; deletions: number } | null {
  const oldLines = splitLinesForDiff(oldText);
  const newLines = splitLinesForDiff(newText);
  if (oldLines.length === 0 && newLines.length === 0) return null;

  const ops = myersDiffOps(oldLines, newLines, { maxEditDistance: MAX_MYERS_EDIT_DISTANCE });
  if (!ops) return null;
  const hunks = buildUnifiedHunksFromOps(ops, contextLines);
  if (hunks.length === 0) return null;
  const counts = countMyersOps(ops);
  return { hunks, additions: counts.additions, deletions: counts.deletions };
}

async function safeReadText(absPath: string, limitBytes = 2 * 1024 * 1024): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const st = await fs.stat(absPath);
    if (st.size > limitBytes) {
      return { ok: false, error: `File too large to diff (${st.size} bytes)` };
    }
    const text = await fs.readFile(absPath, 'utf8');
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'read failed') };
  }
}

async function readBaselineStoredFileText(workspaceRoot: string, sessionId: string, runId: string, relPath: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const baselineDir = baselineDirFor(workspaceRoot, sessionId, runId);
  const storedPath = storedCopyPath(baselineDir, relPath);
  if (!fsSync.existsSync(storedPath)) return { ok: false, error: 'Baseline copy not available for this file' };
  return safeReadText(storedPath);
}

export async function diffWorkspaceBaseline(
  workspaceRoot: string,
  sessionId: string,
  runId?: string,
  relPath?: string,
): Promise<{ ok: boolean; diff?: string; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const resolvedRunId = await resolveRunIdOrLatest(rootAbs, sessionId, runId);
  if (!resolvedRunId) return { ok: false, error: 'No baseline captured for this chat session yet.' };
  const latest = await readLatestRunId(rootAbs, sessionId);
  if (latest && latest !== resolvedRunId) return { ok: false, error: 'Only the latest run can be viewed/undone.' };
  const manifest = await loadManifest(rootAbs, sessionId, resolvedRunId);
  if (!manifest) return { ok: false, error: 'No baseline captured for this chat session yet.' };

  const ignoreRules = await loadRootGitignoreRules(rootAbs);
  const shouldIgnorePath = buildIgnoreMatcher(rootAbs, ignoreRules);

  const baselineDir = baselineDirFor(rootAbs, sessionId, resolvedRunId);
  const baseline = manifest.entries || {};

  const buildFileDiff = async (fileRel: string): Promise<string | null> => {
    if (shouldIgnorePath(fileRel, false)) return null;
    const safe = resolvePathInside(rootAbs, fileRel);
    if (!safe.ok || !safe.abs) return `# Skipped (invalid path): ${fileRel}`;
    const baseEntry = baseline[fileRel];
    const currentExists = fsSync.existsSync(safe.abs);
    const baseExists = !!baseEntry;

    if (!baseExists && !currentExists) return null;

    if (baseEntry && baseEntry.textLike === false) {
      return `diff --git a/${fileRel} b/${fileRel}\n# Binary file changes not shown\n`;
    }

    if (currentExists) {
      const sample = await readSample(safe.abs, 4096).catch(() => Buffer.alloc(0));
      if (!isTextLikeFile(safe.abs, sample)) {
        return `diff --git a/${fileRel} b/${fileRel}\n# Binary file changes not shown\n`;
      }
    }

    let oldText = '';
    let newText = '';
    if (baseExists) {
      const oldRes = await readBaselineStoredFileText(rootAbs, sessionId, resolvedRunId, fileRel);
      if (!oldRes.ok) return `diff --git a/${fileRel} b/${fileRel}\n# ${oldRes.error || 'Failed to read baseline'}\n`;
      oldText = oldRes.text ?? '';
    }
    if (currentExists) {
      const newRes = await safeReadText(safe.abs);
      if (!newRes.ok) return `diff --git a/${fileRel} b/${fileRel}\n# ${newRes.error || 'Failed to read file'}\n`;
      newText = newRes.text ?? '';
    }

    const diff = computeUnifiedDiffFromText(oldText, newText, 3) || (() => {
      const fallback = computeSimpleUnifiedDiffLines(oldText, newText, 3);
      if (!fallback) return null;
      return { hunks: [{ header: fallback.header, lines: fallback.hunk }], additions: 0, deletions: 0 };
    })();
    if (!diff) return null;

    const oldLabel = baseExists ? `a/${fileRel}` : '/dev/null';
    const newLabel = currentExists ? `b/${fileRel}` : '/dev/null';
    const header = [
      `diff --git a/${fileRel} b/${fileRel}`,
      `--- ${oldLabel}`,
      `+++ ${newLabel}`,
      ...diff.hunks.flatMap((h) => [h.header, ...h.lines]),
      '',
    ].join('\n');
    return header;
  };

  if (relPath && typeof relPath === 'string' && relPath.trim()) {
    const fileRel = relPath.trim();
    const out = await buildFileDiff(fileRel);
    return { ok: true, diff: out || '' };
  }

  const changes = await computeWorkspaceBaselineChanges(rootAbs, sessionId, resolvedRunId, { limit: 400, offset: 0 });
  if (!changes.ok || !changes.files) return { ok: false, error: changes.error || 'Failed to compute baseline changes' };

  const chunks: string[] = [];
  for (const f of changes.files) {
    const chunk = await buildFileDiff(f.path);
    if (chunk) chunks.push(chunk);
  }
  return { ok: true, diff: chunks.join('\n') };
}

export async function undoWorkspaceBaselineFile(
  workspaceRoot: string,
  sessionId: string,
  runId: string | undefined,
  relPath: string,
): Promise<{ ok: boolean; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const fileRel = String(relPath ?? '').trim();
  if (!fileRel) return { ok: false, error: 'path is required' };
  const safe = resolvePathInside(rootAbs, fileRel);
  if (!safe.ok || !safe.abs || !safe.rel) return { ok: false, error: safe.error || 'invalid-path' };

  const resolvedRunId = await resolveRunIdOrLatest(rootAbs, sessionId, runId);
  if (!resolvedRunId) return { ok: false, error: 'No baseline captured for this chat session yet.' };
  const latest = await readLatestRunId(rootAbs, sessionId);
  if (latest && latest !== resolvedRunId) return { ok: false, error: 'Only the latest run can be undone.' };
  const manifest = await loadManifest(rootAbs, sessionId, resolvedRunId);
  if (!manifest) return { ok: false, error: 'No baseline captured for this chat session yet.' };
  const baseEntry = manifest.entries?.[safe.rel];
  const baselineDir = baselineDirFor(rootAbs, sessionId, resolvedRunId);

  if (!baseEntry) {
    try {
      await fs.rm(safe.abs, { force: true, recursive: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'Failed to delete file') };
    }
  }

  if (!baseEntry.stored) {
    return { ok: false, error: 'Baseline copy not available for this file (too large or capture skipped).' };
  }

  const source = storedCopyPath(baselineDir, safe.rel);
  if (!fsSync.existsSync(source)) return { ok: false, error: 'Baseline copy missing on disk' };
  try {
    await fs.mkdir(path.dirname(safe.abs), { recursive: true });
    await fs.copyFile(source, safe.abs);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'Failed to restore file') };
  }
}

export async function undoWorkspaceBaselineAll(
  workspaceRoot: string,
  sessionId: string,
  runId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const changes = await computeWorkspaceBaselineChanges(rootAbs, sessionId, runId);
  if (!changes.ok || !changes.files) return { ok: false, error: changes.error || 'No baseline captured for this chat session yet.' };

  for (const f of changes.files) {
    const res = await undoWorkspaceBaselineFile(rootAbs, sessionId, runId, f.path);
    if (!res.ok) return res;
  }
  return { ok: true };
}

export async function deleteWorkspaceBaseline(
  workspaceRoot: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const rootAbs = path.resolve(workspaceRoot);
  const baselineDir = sessionRootDirFor(rootAbs, sessionId);
  try {
    await fs.rm(baselineDir, { force: true, recursive: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error ?? 'Failed to delete baseline') };
  }
}
