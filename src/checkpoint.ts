import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { writeJsonAtomic } from './fsutil.js'

// Checkpoints / rewind (BACKLOG B3).
//
// Undo (src/undo.ts) reverts ONE file write. A checkpoint snapshots the WHOLE
// working tree at the start of a task, so a risky task can be rolled back with
// a single `/rewind`. A tarball — not a git stash — is used on purpose: it
// works in a non-git directory and never touches the operator's index/stash.
//
// Machine codes only ('not_found', 'archive_missing', ...): the caller
// (src/index.ts) localizes them through the i18n catalog, exactly like
// undo.ts. Keeping prose out of this module is also why no Russian leaks here
// (see test/agent-facing-english.test.ts).

const CHECKPOINT_DIR = path.join(os.homedir(), '.zames', 'checkpoints')

// Never snapshotted and never deleted on restore: dependencies, the git object
// store (the operator's own safety net), build output and the agent's scratch
// dir. Everything else is part of the snapshot. Patterns are anchored to the
// archive root ('./x') so a nested `src/tmp` is NOT accidentally excluded.
export const CHECKPOINT_EXCLUDES = ['node_modules', '.git', 'dist', 'tmp']

export interface CheckpointRecord {
  stamp: number
  /** Absolute path of the tarball. */
  file: string
  /** Absolute path of the snapshotted working directory. */
  workdir: string
  /** Optional label ('pre-rewind' for the automatic backup). */
  label?: string
}

export interface CheckpointResult {
  ok: boolean
  reason?: string
  record?: CheckpointRecord
  backup?: CheckpointRecord | null
}

// ---------- pure helpers (unit-tested without tar) ----------

export function tarCreateArgs(archive: string, _dir: string): string[] {
  const args = ['-czf', archive]
  for (const e of CHECKPOINT_EXCLUDES) args.push('--exclude=./' + e)
  args.push('-C', _dir, '.')
  return args
}

export function tarExtractArgs(archive: string, dir: string): string[] {
  return ['-xzf', archive, '-C', dir]
}

/** Keep only the newest `max` records (returns a new array; order preserved). */
export function rotateRecords<T>(records: T[], max: number): T[] {
  if (max <= 0) return []
  if (records.length <= max) return records.slice()
  return records.slice(records.length - max)
}

/**
 * Resolve a `/rewind` selector against records sorted NEWEST FIRST.
 * `1` = most recent; a non-numeric selector is matched as a stamp prefix.
 */
export function pickRecord(
  records: CheckpointRecord[],
  selector: string,
): CheckpointRecord | null {
  const sel = String(selector ?? '').trim()
  if (!sel) return null
  if (/^\d+$/.test(sel)) {
    const n = Number(sel)
    // A small number is an index (1 = newest). An out-of-range number is
    // still tried as a stamp prefix below, so `/rewind 1730000` works.
    if (n >= 1 && n <= records.length) return records[n - 1]
  }
  return records.find((r) => String(r.stamp).startsWith(sel)) || null
}

// ---------- tar / fs plumbing ----------

function runTar(
  args: string[],
  cwd: string,
  timeout = 60_000,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'tar',
      args,
      { cwd, timeout, maxBuffer: 1024 * 1024 * 8, windowsHide: true },
      (err, _stdout, stderr) => {
        if (!err) return resolve({ code: 0, stderr: '' })
        const raw = (err as { code?: unknown }).code
        const code = typeof raw === 'number' ? raw : 127
        resolve({ code, stderr: String(stderr || err.message || '') })
      },
    )
  })
}

async function copyTree(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const e of entries) {
    const src = path.join(from, e.name)
    const dst = path.join(to, e.name)
    if (e.isDirectory()) await copyTree(src, dst)
    else if (e.isSymbolicLink()) {
      const link = await fs.readlink(src).catch(() => null)
      if (link !== null) await fs.symlink(link, dst).catch(() => {})
    } else await fs.copyFile(src, dst)
  }
}

// ---------- store ----------

export class CheckpointStore {
  enabled: boolean
  maxBackups: number
  dir: string

  constructor({
    enabled = true,
    maxBackups = 50,
    dir = CHECKPOINT_DIR,
  }: { enabled?: boolean; maxBackups?: number; dir?: string } = {}) {
    this.enabled = enabled
    this.maxBackups = maxBackups
    this.dir = dir
  }

  private get indexFile(): string {
    return path.join(this.dir, 'index.json')
  }

  private async _ensure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  private async _readIndex(): Promise<CheckpointRecord[]> {
    try {
      const data = JSON.parse(await fs.readFile(this.indexFile, 'utf-8'))
      return Array.isArray(data) ? (data as CheckpointRecord[]) : []
    } catch {
      return []
    }
  }

  /**
   * Snapshot `workdir` into a tarball. Best-effort: a missing tar, an
   * unreadable dir or a timeout yields null, never a thrown error — a failed
   * checkpoint must not abort the task it was meant to protect.
   */
  async create(
    workdir: string,
    label?: string,
  ): Promise<CheckpointRecord | null> {
    if (!this.enabled) return null
    await this._ensure()
    const stamp = Date.now()
    const file = path.join(this.dir, `${stamp}.tgz`)
    const res = await runTar(tarCreateArgs(file, workdir), workdir)
    if (res.code !== 0) {
      await fs.rm(file, { force: true }).catch(() => {})
      return null
    }

    const record: CheckpointRecord = { stamp, file, workdir }
    if (label) record.label = label

    const history = await this._readIndex()
    history.push(record)
    const kept = rotateRecords(history, this.maxBackups)
    // Drop the archives that fell out of the retention window.
    const keptStamps = new Set(kept.map((r) => r.stamp))
    for (const r of history) {
      if (!keptStamps.has(r.stamp))
        await fs.rm(r.file, { force: true }).catch(() => {})
    }
    writeJsonAtomic(this.indexFile, kept)
    return record
  }

  /** Newest-first list, capped at `count`. */
  async list(count = 10): Promise<CheckpointRecord[]> {
    const history = await this._readIndex()
    return history.slice().reverse().slice(0, count)
  }

  /**
   * Restore the working tree to a checkpoint. Backs up the CURRENT tree first
   * (a 'pre-rewind' checkpoint), so the rewind itself is reversible. Returns
   * machine codes; the caller localizes them.
   */
  async restore(selector: string): Promise<CheckpointResult> {
    if (!this.enabled) return { ok: false, reason: 'disabled' }
    const history = await this._readIndex()
    const newestFirst = history.slice().reverse()
    const record = pickRecord(newestFirst, selector)
    if (!record) return { ok: false, reason: 'not_found' }

    const exists = await fs
      .stat(record.file)
      .then(() => true)
      .catch(() => false)
    if (!exists) return { ok: false, reason: 'archive_missing' }

    // Backup the CURRENT tree before touching it.
    const backup = await this.create(record.workdir, 'pre-rewind')

    // Extract to a temp dir FIRST; only a successful extract may touch workdir
    // (otherwise a bad archive would wipe the tree).
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-rewind-'))
    try {
      const res = await runTar(tarExtractArgs(record.file, tmp), tmp)
      if (res.code !== 0) return { ok: false, reason: 'extract_failed' }

      // Full restore: drop everything in workdir except the excludes, then
      // copy the snapshot in. A partial extract would leave behind files the
      // task created after the checkpoint.
      const entries = await fs
        .readdir(record.workdir)
        .catch(() => [] as string[])
      for (const e of entries) {
        if (CHECKPOINT_EXCLUDES.includes(e)) continue
        await fs
          .rm(path.join(record.workdir, e), { recursive: true, force: true })
          .catch(() => {})
      }
      await copyTree(tmp, record.workdir)
      return { ok: true, record, backup }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }
}
