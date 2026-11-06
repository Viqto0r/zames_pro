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
  // `!password` only catches the zero-length string: a password of SPACES (a
  // paste carrying a trailing line, a stray space press) passed validation,
  // the form submitted and the browser answered "wrong password" — the real
  // problem was that nothing was typed. Spaces NEXT TO real characters are
  // legal (the password is never trimmed), so only an all-blank value is
  // treated as missing.
  if (!password || !String(password).trim()) {
    return { ok: false, field: 'pass', reason: 'pass' }
  }
  return { ok: true, field: 'pass', reason: '' }
}
