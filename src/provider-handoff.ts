// Provider-switch HANDOFF: when the operator changes `/provider` in the middle
// of a session, the current chat does NOT exist on the new backend (a chat id
// is meaningful only to the provider that created it), so the conversation
// would be lost. Instead we summarize the current chat on the OLD provider and
// persist a HANDOFF for the target provider; on the next launch the new
// provider opens a fresh chat and posts the summary as its first message.
//
// This mirrors /compact's carryover, but the summary crosses a provider
// boundary and survives a restart, so it is written to disk.

import fs from 'fs'
import path from 'path'
import os from 'os'
import { writeJsonAtomic } from './fsutil.js'
import { providerLabel, type ProviderId } from './providers.js'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HANDOFF_FILE = path.join(ZAMES_HOME, 'provider-handoff.json')

const NL = String.fromCharCode(10)

export interface ProviderHandoff {
  /** The provider the summary is FOR (the one being switched TO). */
  provider: ProviderId
  /**
   * The provider the summary came FROM. Optional: a handoff file written
   * before a THIRD backend existed has no such field, so the reader falls back
   * to "the other one of the two" (see handoffFromLabel). Without this a
   * three-provider switch labelled a GLM summary as coming from DeepSeek.
   */
  from?: ProviderId
  /** The working directory the handoff belongs to. */
  workdir: string
  /** The summary of the previous provider's chat. */
  summary: string
  /** The operator's original goal, carried along so it is not lost. */
  task?: string
  createdAt: string
}

/**
 * The DISPLAY label of the provider a handoff came from. Prefers the explicit
 * `from` field; a legacy file (written when exactly two backends existed) has
 * none, and there "the other one" is the only correct answer. PURE.
 */
export function handoffFromLabel(h: ProviderHandoff): string {
  if (h.from) return providerLabel(h.from)
  // Legacy files were written when exactly TWO backends existed (deepseek and
  // qwen), so "the other one" is only meaningful for those two. A GLM file
  // has no such pair — labelling it `Qwen` told the new chat the summary came
  // from a provider that never wrote it. The original backend is the honest
  // fallback.
  if (h.provider === 'qwen') return 'DeepSeek'
  return 'DeepSeek'
}

/**
 * Wrap a cross-provider summary into the first message of the new provider's
 * chat. PURE (unit-tested): the wording must make clear this is carried-over
 * context from ANOTHER assistant, so the model treats it as history, not as a
 * fresh instruction to redo the work.
 */
export function buildHandoffText(h: {
  from: string
  to: string
  summary: string
  task?: string
}): string {
  const body = String(h.summary ?? '').trim()
  const goal = String(h.task ?? '').trim()
  let out =
    `Context carried over from a previous session with another assistant ` +
    `(${h.from} -> ${h.to}). Treat it as the history of the work so far and ` +
    `continue from the current state. Do NOT redo what is already done.`
  out += NL + NL + body
  if (goal) out += NL + NL + 'Original task: ' + goal
  return out
}

/** Persist a handoff for a provider. Best-effort (never throws to the caller). */
export function saveProviderHandoff(h: ProviderHandoff): void {
  try {
    fs.mkdirSync(ZAMES_HOME, { recursive: true })
    // There is ONE handoff file for all projects, and save used to overwrite
    // it unconditionally: switching providers in project B silently dropped
    // the UNCONSUMED handoff of project A. A pending handoff for another
    // workdir is kept in a per-workdir side file so both survive.
    let pending: ProviderHandoff | null = null
    try {
      pending = JSON.parse(fs.readFileSync(HANDOFF_FILE, 'utf-8'))
    } catch {}
    if (pending && typeof pending.summary === 'string') {
      if (sameDir(pending.workdir, h.workdir)) {
        writeJsonAtomic(HANDOFF_FILE, h)
        return
      }
      writeJsonAtomic(sideHandoffFile(pending.workdir), pending)
    }
    writeJsonAtomic(HANDOFF_FILE, h)
  } catch {}
}

/** A per-workdir copy of a handoff displaced from the global file. */
function sideHandoffFile(workdir: string): string {
  const key = Buffer.from(String(workdir || '')).toString('base64url')
  return path.join(ZAMES_HOME, 'provider-handoff-' + key + '.json')
}

/**
 * Read the pending handoff, but ONLY when it targets `provider` and `workdir`:
 * a handoff for a different provider or project must not be posted into the
 * wrong chat. Returns null when there is none / it does not match.
 */
export function readProviderHandoff(
  provider: ProviderId,
  workdir: string,
): ProviderHandoff | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(HANDOFF_FILE, 'utf-8'),
    ) as ProviderHandoff | null
    if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim()) {
      return null
    }
    if (raw.provider !== provider) return null
    if (!sameDir(raw.workdir, workdir)) {
      // The global file may hold another project's handoff; this project's
      // own one (displaced by a later switch) lives in its side file.
      return readSideHandoff(provider, workdir)
    }
    return raw
  } catch {
    return null
  }
}

function readSideHandoff(
  provider: ProviderId,
  workdir: string,
): ProviderHandoff | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(sideHandoffFile(workdir), 'utf-8'),
    ) as ProviderHandoff | null
    if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim()) {
      return null
    }
    if (raw.provider !== provider) return null
    return sameDir(raw.workdir, workdir) ? raw : null
  } catch {
    return null
  }
}

// Two paths that denote the SAME directory must match: the handoff is consumed
// by the NEXT launch in that directory, and the path there is not guaranteed to
// be byte-identical — a trailing separator (a `/cd sub/` leaves one) or a
// symlinked route to the project used to make a lexical `!==` silently drop the
// carried-over summary. realpath is the comparison; a missing dir falls back to
// the resolved lexical path so a deleted project still matches its record.
function sameDir(a: string | undefined, b: string | undefined): boolean {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x === y) return true
  if (!x || !y) return false
  const real = (p: string): string => {
    const abs = path.resolve(p)
    try {
      return fs.realpathSync(abs)
    } catch {
      return abs
    }
  }
  return real(x) === real(y)
}

/** Remove the handoff once it has been posted (or is stale). Best-effort.
 *
 *  The GLOBAL file and every per-workdir SIDE file are removed. Clearing only
 *  the global one left a displaced record readable through its side file, so
 *  an already-consumed summary was posted again on a later switch in that
 *  project ("the summary came back from the dead"). Side files are small and
 *  their whole purpose is a pending handoff, so removing all of them is safe. */
export function clearProviderHandoff(): void {
  try {
    fs.unlinkSync(HANDOFF_FILE)
  } catch {}
  try {
    for (const f of fs.readdirSync(ZAMES_HOME)) {
      if (!f.startsWith('provider-handoff-') || !f.endsWith('.json')) continue
      try {
        fs.unlinkSync(path.join(ZAMES_HOME, f))
      } catch {}
    }
  } catch {}
}
