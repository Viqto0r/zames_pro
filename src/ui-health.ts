// UI health check — a cheap "can the agent still drive this page?" probe.
//
// WHY: every selector in the provider's *-ui.ts is an assumption about a page
// we do not control. When the site ships a redesign, the FIRST symptom used to
// be a task hanging on "input field not found" (or a silently mis-clicked
// send), minutes into a run. This module turns that into an explicit answer
// BEFORE the task: it checks the capabilities the agent ALWAYS needs and
// reports the missing ones. The page object is injected (the browser owns
// Playwright), so the decision logic here stays pure and unit-testable.
//
// Only ALWAYS-PRESENT capabilities are probed. The Stop button and the answer
// nodes are TRANSIENT (Stop exists only during generation, answers only after
// a turn), so a presence probe on a healthy idle page would report false
// negatives; they are deliberately excluded.

import {
  INPUT_SELECTORS,
  SEND_SELECTORS,
  TOGGLE_SELECTORS,
  NEW_CHAT_SELECTOR,
  NEW_CHAT_TEXT_RE,
} from './deepseek-ui.js'

export type UiCapability = 'input' | 'send' | 'toggles' | 'newChat'

/** Minimal page surface the probe needs (Playwright's Locator.count). */
export interface UiProbePage {
  count(selector: string): Promise<number>
  /** Count elements matching `selector` whose text matches `textRe`. */
  countByText(selector: string, textRe: RegExp): Promise<number>
}

export interface UiCapabilitySpec {
  capability: UiCapability
  /** Selector chain; the first one with a hit wins. Empty ⇒ text-probed. */
  selectors: string[]
  /** A missing CRITICAL capability means the agent cannot work at all. */
  critical: boolean
  /**
   * Optional EXACT text label matcher. DeepSeek's new-chat control is a <div>
   * matched by its label; a provider whose control is a normal button (Qwen)
   * leaves this unset and relies on the selector alone.
   */
  textRe?: RegExp
}

// DeepSeek's default capability list. Critical: without the input the prompt
// cannot be typed, without send it cannot be submitted — a task would hang on
// `ds.input_missing`. Advisory: toggles/newChat degrade gracefully (the toggles
// fall back to the configured state, newChat falls back to navigating to the
// base URL).
export const UI_CAPABILITIES: UiCapabilitySpec[] = [
  { capability: 'input', selectors: INPUT_SELECTORS, critical: true },
  { capability: 'send', selectors: SEND_SELECTORS, critical: true },
  { capability: 'toggles', selectors: TOGGLE_SELECTORS, critical: false },
  {
    capability: 'newChat',
    selectors: [NEW_CHAT_SELECTOR],
    critical: false,
    textRe: NEW_CHAT_TEXT_RE,
  },
]

export interface UiHealthResult {
  ok: boolean
  present: UiCapability[]
  missing: UiCapability[]
  /** Missing capabilities that BLOCK the agent entirely. */
  missingCritical: UiCapability[]
}

async function hasAny(
  page: UiProbePage,
  sel: string,
  textRe?: RegExp,
): Promise<boolean> {
  try {
    const n = textRe
      ? await page.countByText(sel, textRe)
      : await page.count(sel)
    return n > 0
  } catch {
    return false
  }
}

/**
 * Probe the always-present controls of a provider's chat page. Never throws: a
 * dead page is reported as every capability missing, which the caller surfaces
 * to the operator instead of letting the next task hang.
 *
 * `capabilities` is a parameter so each provider (deepseek-ui.ts, qwen-ui.ts)
 * can supply its own selectors while the probe logic stays shared.
 */
export async function probeUiHealth(
  page: UiProbePage,
  capabilities: UiCapabilitySpec[] = UI_CAPABILITIES,
): Promise<UiHealthResult> {
  const present: UiCapability[] = []
  const missing: UiCapability[] = []
  const missingCritical: UiCapability[] = []

  for (const spec of capabilities) {
    // A capability with NO selectors cannot be probed at all: the provider does
    // not have that control (z.ai has no toggles). Reporting it as missing made
    // the startup/doctor warning scream «not found (toggles)» on every healthy
    // page. It is N/A, not absent.
    if (!spec.selectors || spec.selectors.length === 0) continue
    let found = false
    for (const sel of spec.selectors) {
      if (await hasAny(page, sel, spec.textRe)) {
        found = true
        break
      }
    }
    if (found) present.push(spec.capability)
    else {
      missing.push(spec.capability)
      if (spec.critical) missingCritical.push(spec.capability)
    }
  }

  return {
    ok: missingCritical.length === 0,
    present,
    missing,
    missingCritical,
  }
}
