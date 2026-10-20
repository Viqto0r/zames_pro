import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Every test temp dir lives under os.tmpdir(). On WSL that directory is inside
// the ext4.vhdx file backing the distro, and Windows only reclaims the space in
// multi-MB blocks: thousands of abandoned `zames-*` dirs fragment the vhdx and
// the freed space never returns to C: (the disk filled up). So a temp dir must
// be DELETED after the test that created it, and the cleanup must be registered
// by construction (t.after) — a test that forgets to clean up is exactly how
// the dirs accumulated.
//
// Two kinds of context are accepted:
//   * a test context (`t.after`) — the normal case;
//   * the `on-end` hook if the dir is created at MODULE LEVEL ("the HOME swap"
//     before the module import), where the cleanup must run when the whole file
//     finishes. That context is built by hand: `{ on: (e, fn) => { if (e ===
//     'end') after(fn) } }` (node:test's `after` accepts only a callback).
//
// A type-check is NOT enough to catch a silently misspent context: the types
// are structurally the same, the RUNTIME is not (`after` has no `t.after`).

export interface TmpCleanup {
  after?: (fn: () => unknown) => unknown
  on?: (event: 'end', fn: () => unknown) => unknown
}

function registerCleanup(ctx: TmpCleanup, clean: () => unknown): void {
  if (typeof ctx.after === 'function') {
    ctx.after(clean)
    return
  }
  if (typeof ctx.on === 'function') {
    ctx.on('end', clean)
    return
  }
  // Last resort: never leak silently -- a warning is better than a
  // directory that lives forever.
  console.warn('makeTmpDir: context has neither after() nor on()')
}

/** A temp dir removed when `t` finishes (pass the test context). */
export async function makeTmpDir(
  ctx: TmpCleanup,
  prefix = 'zames-',
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  registerCleanup(ctx, () => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

/** Sync variant, for module-level HOME swaps done before imports. */
export function makeTmpDirSync(ctx: TmpCleanup, prefix = 'zames-'): string {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), prefix))
  registerCleanup(ctx, () =>
    fsSync.rmSync(dir, { recursive: true, force: true }),
  )
  return dir
}
