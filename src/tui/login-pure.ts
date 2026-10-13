// PURE helpers for the Ink login / text-prompt forms. Kept separate from the
// components so the masking and validation are unit-tested without rendering.

export interface LoginValidation {
  ok: boolean
  /** 'user' | 'pass' — which field to focus when `ok` is false. */
  field: 'user' | 'pass'
  /** '' when ok; otherwise the reason key (auth.form.need_user/need_pass). */
  reason: '' | 'user' | 'pass'
}

/** Mask every character of a secret with `*` (code-point aware). */
export function maskSecret(s: string): string {
  return '*'.repeat(Array.from(String(s ?? '')).length)
}

/**
 * Validate the login form. Username is trimmed; the password is used as-is
 * (leading/trailing spaces are legal in a password). Empty fields are
 * rejected with the field to focus.
 */
export function validateLogin(
  username: string,
  password: string,
): LoginValidation {
  if (!String(username ?? '').trim()) {
    return { ok: false, field: 'user', reason: 'user' }
  }
  if (!password) {
    return { ok: false, field: 'pass', reason: 'pass' }
  }
  return { ok: true, field: 'pass', reason: '' }
}
