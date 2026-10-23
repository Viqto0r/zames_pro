import type { Session } from './types.js'
import { translate, type TranslateFn } from './i18n.js'

// Pure half of the session commands (/sessions, /resume-id). The resume itself
// drives a browser; deciding WHICH session may be opened — the filter, the id
// normalization, a foreign-provider refusal — is pure and lives here.

/** Parse the text after `/resume-id` into a chat id, or null when empty. */
export function parseResumeId(arg: string): string | null {
  const id = String(arg ?? '').trim()
  return id ? id : null
}

/** Keep the sessions matching a `/sessions <query>` filter (title or workdir). */
export function filterSessions(sessions: Session[], filter: string): Session[] {
  const q = String(filter ?? '')
    .trim()
    .toLowerCase()
  if (!q) return sessions.slice()
  return sessions.filter(
    (s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.workdir || '').toLowerCase().includes(q),
  )
}

/**
 * A chat id only exists on the backend that created it, so opening a session
 * saved by ANOTHER provider would fail inside the browser with a confusing
 * error. Old files carry no `provider` field and belong to DeepSeek (the only
 * backend that existed then).
 *
 * Returns a user-facing refusal, or null when the session may be opened.
 */
export function resumeProviderRefusal(
  session: Pick<Session, 'provider'> | null | undefined,
  activeProvider: string,
  t: TranslateFn = translate('en'),
): string | null {
  if (!session) return null
  const owner = session.provider || 'deepseek'
  if (owner === activeProvider) return null
  return t('sessions.provider_mismatch', {
    owner,
    active: activeProvider,
  })
}
