// Pure in-page DOM helpers extracted from DeepSeekBrowser (BACKLOG C3).
//
// Every function here runs INSIDE page.evaluate, so it MUST be fully
// self-contained: Playwright serializes the function SOURCE and evaluates it in
// the page, where module scope does not exist. Only DOM globals and the passed
// argument are available — a reference to another helper of this file would be
// lost. This is the same constraint browser-chats.ts works under; keeping the
// callbacks here instead of inline in the class keeps the class body thin
// without changing behavior.

/**
 * Read ONLY visible toast/notification containers as one text blob.
 *
 * WHY this list is narrow: a broad `[class*="error" i]` matched leftover page
 * text and produced a FALSE rate limit. Keeping to real toast containers means
 * no false positives, so ask() does not go into a needless 5-minute wait.
 */
export function readPageToastsInDom(): string {
  const sels = [
    '[role="alert"]',
    '[class*="toast" i]',
    '[class*="notification" i]',
  ]
  let out = ''
  for (const s of sels) {
    for (const el of Array.from(document.querySelectorAll(s))) {
      const e = el as HTMLElement
      const st = getComputedStyle(e)
      if (st.display === 'none' || st.visibility === 'hidden') continue
      out += ' ' + (e.innerText || '')
    }
  }
  return out
}

/**
 * Read a visible login/credentials error message from the page, if any.
 * Best-effort: the caller slices/trims; this returns the joined text.
 */
export function readLoginErrorInDom(): string {
  const sels = [
    '[role="alert"]',
    '[class*="error" i]',
    '[class*="toast" i]',
    '[class*="notification" i]',
  ]
  let out = ''
  for (const s of sels) {
    for (const el of Array.from(document.querySelectorAll(s))) {
      const e = el as HTMLElement
      const st = getComputedStyle(e)
      if (st.display === 'none' || st.visibility === 'hidden') continue
      const t = (e.innerText || '').trim()
      if (t) out += ' ' + t
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * The answer as RENDERED on the page, ALWAYS from the DOM (never the network
 * capture). Reasoning blocks (think class) are skipped and must never be
 * picked up as the answer.
 */
export function readLastAnswerInDom(opts: {
  sels: string[]
  thinkRe: string
}): string {
  const sels = opts.sels
  const think = new RegExp(opts.thinkRe, 'i')
  const inThink = (e: Element | null): boolean => {
    let n: Element | null = e
    while (n) {
      const cls = (n.className || '').toString()
      if (think.test(cls)) return true
      n = n.parentElement
    }
    return false
  }
  let el: HTMLElement | null = null
  for (const s of sels) {
    const list = document.querySelectorAll(s)
    if (!list.length) continue
    for (let i = list.length - 1; i >= 0; i--) {
      const cand = list[i] as HTMLElement
      if (inThink(cand)) continue
      el = cand
      break
    }
    if (el) break
  }
  if (!el) return ''
  const out: string = el.innerText || el.textContent || ''
  const NL = String.fromCharCode(10)
  return out.replace(new RegExp(NL + '{3,}', 'g'), NL + NL).trim()
}

/**
 * A CHEAP growth signal for the "did the answer start?" loop: the number of
 * message/answer nodes plus the length of the LAST answer element. The old code
 * read document.body.innerText.length every tick, which serializes the WHOLE
 * page (sidebar, history, menus) and forces a layout — expensive on a long chat.
 */
export function chatSignalInDom(opts: { nodesSel: string; mdSel: string }): {
  nodes: number
  lastLen: number
} {
  const nodes = document.querySelectorAll(opts.nodesSel).length
  let lastLen = 0
  const answers = document.querySelectorAll(opts.mdSel)
  if (answers.length) {
    const lastEl = answers[answers.length - 1] as HTMLElement
    lastLen = (lastEl.innerText || '').length
  }
  return { nodes, lastLen }
}

/**
 * Cheap first probe for the Continue button: ONE scan of buttons/role-buttons
 * for a matching visible label. The common path (no button) is probed every
 * tick, so a single evaluate replaces the getByRole count+isVisible scan.
 */
export function continueVisibleCheapInDom(nameRe: string): boolean {
  const re = new RegExp(nameRe, 'i')
  const cands = Array.from(
    document.querySelectorAll('div[role="button"], button'),
  ) as HTMLElement[]
  for (const e of cands) {
    const label = (
      (e.textContent || '') +
      ' ' +
      (e.getAttribute('aria-label') || '')
    )
      .replace(/\s+/g, ' ')
      .trim()
    if (!re.test(label)) continue
    const st = getComputedStyle(e)
    if (st.display === 'none' || st.visibility === 'hidden') continue
    const r = e.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return true
  }
  return false
}

/**
 * Find the Stop button in the DeepSeek UI. We can't rely on the class alone:
 * during generation the send button (the same circle button) changes its icon
 * to a "square" (stop) while keeping the classes, so a square icon (svg rect)
 * also means Stop.
 */
export function stopButtonVisibleInDom(btnRe: string): boolean {
  const re = new RegExp(btnRe, 'i')
  const btns = Array.from(
    document.querySelectorAll('div[role="button"], button'),
  ) as HTMLElement[]
  for (const b of btns) {
    const cls = (b.className || '').toString()
    if (!re.test(cls)) continue
    const label = (
      (b.getAttribute('aria-label') || '') +
      ' ' +
      (b.getAttribute('title') || '') +
      ' ' +
      (b.textContent || '')
    ).toLowerCase()
    if (/stop|останов/.test(label)) return true
    // A square icon = Stop button; an arrow (path without rect) = send.
    const svg = b.querySelector('svg')
    if (svg && svg.querySelector('rect')) return true
  }
  return false
}

/**
 * Raw-DOM Stop click with the full pointer/mouse sequence (older builds
 * without a proper role, or a click intercepted by an overlay). Returns true
 * when a square-icon button was found and clicked.
 */
export function clickStopInDom(btnRe: string): boolean {
  const re = new RegExp(btnRe, 'i')
  const btns = Array.from(
    document.querySelectorAll('div[role="button"], button'),
  ) as HTMLElement[]
  for (const b of btns) {
    const cls = (b.className || '').toString()
    if (!re.test(cls)) continue
    const svg = b.querySelector('svg')
    if (svg && svg.querySelector('rect')) {
      for (const type of [
        'pointerdown',
        'mousedown',
        'pointerup',
        'mouseup',
        'click',
      ]) {
        b.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true }),
        )
      }
      b.click()
      return true
    }
  }
  return false
}

/**
 * Raw-DOM scan for a visible Continue button (fallback for builds without a
 * proper role). The label match is an EXACT short form (optionally with a
 * reasoning suffix) so a "Continue" inside rendered prose is never matched.
 */
export function continueVisibleInDom(): boolean {
  const labelOf = (b: HTMLElement): string =>
    ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''))
      .replace(/\s+/g, ' ')
      .trim()
  const isExact = (t: string): boolean =>
    /^(?:continue|продолжить|продолжение)(?:\s+(?:think(?:ing)?|reason(?:ing)?|размышлени[ея]|генераци[юя]|ответ))?\s*[.!…]?$/i.test(
      t,
    )
  const cands = Array.from(
    document.querySelectorAll('div[role="button"], button'),
  ) as HTMLElement[]
  for (const e of cands) {
    if (!isExact(labelOf(e))) continue
    const st = getComputedStyle(e)
    if (st.display === 'none' || st.visibility === 'hidden') continue
    const r = e.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return true
  }
  return false
}

/**
 * Raw-DOM Continue click with the full pointer/mouse sequence (fallback for a
 * build without a proper role, or a click intercepted by an overlay).
 * Returns true when a matching visible button was clicked.
 */
export function clickContinueInDom(): boolean {
  const labelOf = (b: HTMLElement): string =>
    ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''))
      .replace(/\s+/g, ' ')
      .trim()
  const isExact = (t: string): boolean =>
    /^(?:continue|продолжить|продолжение)(?:\s+(?:think(?:ing)?|reason(?:ing)?|размышлени[ея]|генераци[юя]|ответ))?\s*[.!…]?$/i.test(
      t,
    )
  const cands = Array.from(
    document.querySelectorAll('div[role="button"], button'),
  ) as HTMLElement[]
  for (const e of cands) {
    const t = labelOf(e)
    if (!isExact(t)) continue
    const st = getComputedStyle(e)
    if (st.display === 'none' || st.visibility === 'hidden') continue
    const rect = e.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      button: 0,
    } as MouseEventInit
    try {
      e.dispatchEvent(new PointerEvent('pointerdown', opts))
      e.dispatchEvent(new MouseEvent('mousedown', opts))
      e.dispatchEvent(new PointerEvent('pointerup', opts))
      e.dispatchEvent(new MouseEvent('mouseup', opts))
    } catch {}
    e.click()
    return true
  }
  return false
}

/**
 * Insert text into a contenteditable/input element by dispatching a synthetic
 * paste event (the way a real paste lands, which React handlers honor). Runs
 * bound to the element, so it receives `el` + the text value.
 */
export function pasteTextIntoElement(el: HTMLElement, value: string): boolean {
  el.focus()
  const dt = new DataTransfer()
  dt.setData('text/plain', value)
  const ev = new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  })
  el.dispatchEvent(ev)
  return true
}

/**
 * Read the current text of an input/textarea (its `value`) or a
 * contenteditable element (its innerText/textContent). Runs bound to the
 * element so it can distinguish the two by tagName.
 */
export function readElementText(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'input') {
    return (el as HTMLInputElement).value
  }
  return el.innerText || el.textContent || ''
}

/**
 * Lowercased tagName of an element. Runs bound to the element (Playwright's
 * Locator.evaluate), used to tell a native input/textarea from a
 * contenteditable box.
 */
export function elementTagNameInDom(el: Element): string {
  return el.tagName.toLowerCase()
}

/**
 * Is the send control actually enabled? DeepSeek's send control is a
 * div[role=button]; Playwright's isEnabled() does NOT honor aria-disabled on a
 * div, and a click on a disabled button is silently ignored (during an upload
 * the message stays in the box). Read the attribute and a disabled class
 * directly. Runs bound to the element.
 */
export function isElementEnabledInDom(el: Element): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return false
  const cls = (el.className || '').toString()
  if (/disabled|is-disabled/.test(cls)) return false
  return true
}

/**
 * The current text of the input box, trimmed — used to verify the message was
 * actually SENT (DeepSeek clears the box on accept; if the text is still there
 * the click/Enter was ignored). Runs bound to the element.
 */
export function readInputTrimmedTextInDom(el: HTMLTextAreaElement): string {
  return (el.value || el.innerText || el.textContent || '').trim()
}

/**
 * The real User-Agent the engine reports. Read after launch so a headless run
 * can strip the "Headless" marker (DeepSeek's CDN 403s that UA).
 */
export function readUserAgentInDom(): string {
  return navigator.userAgent
}

/**
 * Find the index of the text/email/tel input that immediately precedes the
 * password field, so the login form can be filled when no explicit
 * LOGIN_SELECTORS matched. Returns -1 when not found.
 */
export function findLoginInputIndexInDom(pwdSel: string): number {
  const p = document.querySelector(pwdSel) as HTMLInputElement | null
  if (!p) return -1
  const inputs = Array.from(
    document.querySelectorAll('input'),
  ) as HTMLInputElement[]
  const pi = inputs.indexOf(p)
  for (let i = pi - 1; i >= 0; i--) {
    const t = (inputs[i].type || 'text').toLowerCase()
    if (t === 'text' || t === 'email' || t === 'tel') return i
  }
  return -1
}

/**
 * Submit the login form from inside the page: click the button whose label
 * matches the login regex, else the primary-looking button in the password
 * field's form. Returns true when a button was clicked. The in-page click is
 * a fallback for a React form whose submit control the selectors missed.
 */
export function submitLoginFormInDom(opts: {
  pwdSel: string
  submitRe: string
}): boolean {
  const loginRe = new RegExp(opts.submitRe, 'i')
  const p = document.querySelector(opts.pwdSel) as HTMLInputElement | null
  if (!p) return false
  const form = p.closest('form')
  const scope: ParentNode = form || document
  const btns = Array.from(
    scope.querySelectorAll('button[type="submit"], button, div[role="button"]'),
  ) as HTMLElement[]
  for (const b of btns) {
    const txt = (b.textContent || '').trim().toLowerCase()
    const aria = (b.getAttribute('aria-label') || '').toLowerCase()
    if (loginRe.test(txt + ' ' + aria)) {
      b.click()
      return true
    }
  }
  // Fallback: the primary-looking button in the scope.
  const primary = btns.find((b) => {
    const cls = (b.className || '').toString()
    return /primary|submit|ds-button--primary/i.test(cls)
  })
  if (primary) {
    primary.click()
    return true
  }
  return false
}

/**
 * Prefix/restore the tab title so the operator, looking at the browser
 * window, can tell that the agent is generating. The ORIGINAL title is saved
 * ONCE on `window` and restored when generation ends, so DeepSeek's own chat
 * title is never lost.
 */
export function setBusyTitleInDom(on: boolean): void {
  const w = window as unknown as { __zamesTitle?: string }
  if (on) {
    if (typeof w.__zamesTitle !== 'string') {
      w.__zamesTitle = document.title.replace(/^⏳\s*/, '')
    }
    document.title = '⏳ ' + w.__zamesTitle
  } else if (typeof w.__zamesTitle === 'string') {
    document.title = w.__zamesTitle
    w.__zamesTitle = undefined
  }
}

/**
 * Count how many elements each candidate selector matches, for /debug-dom.
 * Runs in-page (see the module header) so it takes the selector lists as an
 * argument instead of referencing deepseek-ui.ts.
 */
export function dumpDomCountsInDom(sels: {
  answers: string[]
  stops: string[]
  inputs: string[]
}): {
  answers: Record<string, number>
  stops: Record<string, number>
  inputs: Record<string, number>
} {
  const result: {
    answers: Record<string, number>
    stops: Record<string, number>
    inputs: Record<string, number>
  } = { answers: {}, stops: {}, inputs: {} }
  for (const s of sels.answers) {
    result.answers[s] = document.querySelectorAll(s).length
  }
  for (const s of sels.stops) {
    result.stops[s] = document.querySelectorAll(s).length
  }
  for (const s of sels.inputs) {
    result.inputs[s] = document.querySelectorAll(s).length
  }
  return result
}
