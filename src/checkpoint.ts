import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { writeJsonAtomic } from './fsutil.js'

// Checkpoints / rewind.
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
  /**
   * Git fingerprint (HEAD + `git status --porcelain`) of the tree at snapshot
   * time. Used to skip a redundant checkpoint when the tracked state has not
   * changed since the previous one. Absent for a non-git directory.
   */
  fingerprint?: string
}

export interface CheckpointResult {
  ok: boolean
  reason?: string
  /** Extra human context for a failure (e.g. the copy error message). */
  detail?: string
  record?: CheckpointRecord
  backup?: CheckpointRecord | null
}

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

/** True for a selector that is exactly a full epoch-ms stamp (13 digits). */
export function isFullStampSelector(selector: string): boolean {
  return /^\d{13}$/.test(String(selector ?? '').trim())
}

/**
 * Resolve a `/rewind` selector against records sorted NEWEST FIRST.
 * `1` = most recent; a longer number is matched as a stamp prefix.
 */
export function pickRecord(
  records: CheckpointRecord[],
  selector: string,
  /** The FULL record set, when `records` is only a display window. */
  allRecords?: CheckpointRecord[],
): CheckpointRecord | null {
  const sel = String(selector ?? '').trim()
  if (!sel) return null
  // A FULL epoch-ms stamp names exactly ONE checkpoint, wherever it sits in
  // the index. The command resolves against the newest-10 display window while
  // restore() searches the WHOLE index, so an older checkpoint picked by its
  // full stamp used to report "/rewind failed" — and, worse, a stamp that
  // happened to share its first digits with a NEWER one was resolved to that
  // WRONG record. A full stamp is therefore matched against the full set
  // FIRST, and only then treated as an index.
  if (isFullStampSelector(sel)) {
    const pool = allRecords && allRecords.length ? allRecords : records
    const exact = pool.find((r) => String(r.stamp) === sel)
    if (exact) return exact
  }
  if (/^\d+$/.test(sel)) {
    const n = Number(sel)
    // A small number is an index (1 = newest).
    if (n >= 1 && n <= records.length) return records[n - 1]
    // A stamp is epoch-ms (~13 digits), but older files and tests may hold
    // a SHORT one, so the prefix form stays. What must NOT happen is a bare
    // out-of-range INDEX matching a stamp by its first digit (`/rewind 9`
    // with 5 checkpoints): the prefix form therefore needs TWO digits.
    if (sel.length < 2) return null
  }
  const pool = allRecords && allRecords.length ? allRecords : records
  return (
    records.find((r) => String(r.stamp).startsWith(sel)) ||
    pool.find((r) => String(r.stamp).startsWith(sel)) ||
    null
  )
}

function runTar(
  args: string[],
  cwd: string,
  timeout = 60_000,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    // `execFile` throws SYNCHRONOUSLY on a spawn error (ENOENT for the shell,
    // ENOTDIR when the cwd is a regular file). A checkpoint must be
    // BEST-EFFORT: an escaped throw aborted the task it was meant to protect
    // (create) or crashed /rewind (restore) instead of returning null / a
    // reason. Normalize it to the same machine failure every caller handles.
    try {
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
    } catch (e) {
      resolve({ code: 127, stderr: (e as Error).message })
    }
  })
}

// Git fingerprint of a working tree: HEAD plus the porcelain status. Two
// snapshots with the same fingerprint hold the same TRACKED state, so a
// second checkpoint would be a duplicate. Returns null for a non-git dir (or
// when git is unavailable) — then the caller always snapshots (no debounce).
function workdirFingerprint(workdir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', workdir, 'status', '--porcelain=v1', '--branch'],
      { timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        resolve(String(stdout || '').trim() || 'clean')
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
    let raw: string
    try {
      raw = await fs.readFile(this.indexFile, 'utf-8')
    } catch {
      return []
    }
    try {
      const data = JSON.parse(raw)
      if (Array.isArray(data)) return data as CheckpointRecord[]
    } catch {
      // A CORRUPT index must not hide the archives that are still on disk:
      // /rewind would say "nothing to rewind" and the next create() would
      // start a fresh index, leaving the orphans unprunable forever.
    }
    return await this._rebuildIndexFromDisk()
  }

  /**
   * Reconstruct the index from archive file names (`<stamp>-<uniq>.tgz`) when
   * index.json is missing or corrupt. The workdir cannot be recovered from an
   * archive name, so a rebuilt record carries the checkpoint DIR as a last
   * resort — restore() extracts the archive itself, and a wrong workdir only
   * affects the label /checkpoints shows.
   */
  private async _rebuildIndexFromDisk(): Promise<CheckpointRecord[]> {
    const out: CheckpointRecord[] = []
    let files: string[]
    try {
      files = await fs.readdir(this.dir)
    } catch {
      return out
    }
    for (const f of files) {
      const m = /^(\d+)-[0-9a-f]+\.tgz$/.exec(f)
      if (!m) continue
      out.push({
        stamp: Number(m[1]),
        file: path.join(this.dir, f),
        workdir: this.dir,
      })
    }
    out.sort((a, b) => a.stamp - b.stamp)
    return out
  }

  /**
   * Snapshot `workdir` into a tarball. Best-effort: a missing tar, an
   * unreadable dir or a timeout yields null, never a thrown error — a failed
   * checkpoint must not abort the task it was meant to protect.
   */
  async create(
    workdir: string,
    label?: string,
    /** When false, always create a new archive (skip the fingerprint dedupe). */
    allowDedupe = true,
  ): Promise<CheckpointRecord | null> {
    if (!this.enabled) return null
    await this._ensure()

    // Debounce: a checkpoint is taken before EVERY task, and consecutive
    // tasks in one queue often start with an IDENTICAL tracked state (the
    // previous task made no commit and no tracked edit that survived).
    // Re-taring the whole tree then only burns time. If the last record for
    // this workdir carries the SAME git fingerprint, reuse it instead of
    // snapshotting again. Non-git dirs get a null fingerprint and are always
    // snapshotted (we cannot cheaply prove the tree is unchanged).
    const fingerprint = allowDedupe ? await workdirFingerprint(workdir) : null
    if (fingerprint) {
      const history = await this._readIndex()
      const last = [...history]
        .reverse()
        .find((r) => r.workdir === workdir && r.fingerprint)
      if (
        last &&
        last.fingerprint === fingerprint &&
        (await fs
          .access(last.file)
          .then(() => true)
          .catch(() => false))
      ) {
        return last
      }
    }

    const stamp = Date.now()
    // Two checkpoints in the SAME millisecond would share `${stamp}.tgz` and
    // the second would overwrite the first (losing a snapshot). Add a random
    // suffix so an archive name is unique.
    const uniq = randomBytes(3).toString('hex')
    const file = path.join(this.dir, `${stamp}-${uniq}.tgz`)
    const res = await runTar(tarCreateArgs(file, workdir), workdir)
    if (res.code !== 0) {
      await fs.rm(file, { force: true }).catch(() => {})
      return null
    }

    const record: CheckpointRecord = { stamp, file, workdir }
    if (label) record.label = label
    if (fingerprint) record.fingerprint = fingerprint

    const history = await this._readIndex()
    history.push(record)
    const kept = rotateRecords(history, this.maxBackups)
    // Drop the archives that fell out of the retention window. Keyed by the
    // RECORD, not by its stamp: the stamp is ms-precision, so two snapshots of
    // one workdir taken in the same millisecond share it — the pruned record
    // then looked "kept" thanks to its sibling and its archive stayed on disk
    // as an orphan forever.
    const keptSet = new Set(kept)
    for (const r of history) {
      if (!keptSet.has(r)) await fs.rm(r.file, { force: true }).catch(() => {})
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

    // Extract to a temp dir FIRST; only a successful extract may touch workdir
    // (otherwise a bad archive would wipe the tree). The pre-rewind backup is
    // taken AFTER this check: a corrupt archive would otherwise cost a FULL
    // snapshot of the tree on every attempt, filling /checkpoints with
    // identical entries and evicting the real ones.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-rewind-'))
    try {
      const res = await runTar(tarExtractArgs(record.file, tmp), tmp)
      if (res.code !== 0) return { ok: false, reason: 'extract_failed' }

      // Backup the CURRENT tree before touching it.
      const backup = await this.create(record.workdir, 'pre-rewind', false)

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
      // A copy failure here must NOT surface as an uncaught throw that leaves
      // the (already wiped) tree half-restored: report it as a failure so the
      // caller can tell the operator to /rewind from the pre-rewind backup.
      try {
        await copyTree(tmp, record.workdir)
      } catch (e) {
        return {
          ok: false,
          reason: 'copy_failed',
          detail: (e as Error).message,
        }
      }
      return { ok: true, record, backup }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }
}
