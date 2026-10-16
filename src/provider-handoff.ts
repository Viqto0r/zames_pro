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
import type { ProviderId } from './providers.js'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HANDOFF_FILE = path.join(ZAMES_HOME, 'provider-handoff.json')

const NL = String.fromCharCode(10)

export interface ProviderHandoff {
  /** The provider the summary is FOR (the one being switched TO). */
  provider: ProviderId
  /** The working directory the handoff belongs to. */
  workdir: string
  /** The summary of the previous provider's chat. */
  summary: string
  /** The operator's original goal, carried along so it is not lost. */
  task?: string
  createdAt: string
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
    writeJsonAtomic(HANDOFF_FILE, h)
  } catch {}
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
    if ((raw.workdir || '') !== (workdir || '')) return null
    return raw
  } catch {
    return null
  }
}

/** Remove the handoff once it has been posted (or is stale). Best-effort. */
export function clearProviderHandoff(): void {
  try {
    fs.unlinkSync(HANDOFF_FILE)
  } catch {}
}
