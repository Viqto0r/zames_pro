// Live application of /config changes to the objects built ONCE at
// startup (the browser, the undo/checkpoint stores). setConfigRuntime only
// mutates the config object; these objects COPIED their values at
// construction, so a change must be pushed onto the live instance too or it
// is silently a no-op until a restart. The path->target mapping is PURE and
// unit-tested here; index.ts wires it to the live instances.

/** config path -> field name on the browser instance. Both backends
 *  share these names; a field that is absent on the active backend
 *  (e.g. DeepSeek-only thinkingExtraMs on Qwen) is skipped, not thrown. */
export const BROWSER_LIVE_CONFIG: Record<string, string> = {
  'browser.answerTimeoutMs': 'answerTimeoutMs',
  'browser.askRetries': 'askRetries',
  'browser.stabilityChecks': 'stabilityChecks',
  'browser.stabilityDelayMs': 'stabilityDelayMs',
  'browser.minSendIntervalMs': 'minSendIntervalMs',
  'browser.thinkingExtraMs': 'thinkingExtraMs',
  'browser.rateLimitWaitMs': 'rateLimitWaitMs',
  'browser.maxRateLimitRetries': 'maxRateLimitRetries',
  'browser.maxIncompleteRetries': 'maxIncompleteRetries',
  'browser.incompleteWaitMs': 'incompleteWaitMs',
  'browser.autoContinue': 'autoContinue',
  'browser.continueMinGapMs': 'continueMinGapMs',
  'browser.askDeadlineMs': 'askDeadlineMs',
  'browser.maxAfterToolRetries': 'maxAfterToolRetries',
}

/** Push a browser.* change onto the live instance. Returns true when a
 *  field was written (false = not a browser timing knob, or absent on this
 *  backend). */
export function applyBrowserLiveConfig(
  path: string,
  value: unknown,
  browser: Record<string, unknown>,
): boolean {
  const field = BROWSER_LIVE_CONFIG[path]
  if (!field || !(field in browser)) return false
  browser[field] = value
  // `answerTimeoutMs` is DERIVED into the watchdog (`askDeadlineMs` = the
  // answer timeout + 60s) by the Qwen/GLM constructors. Pushing only the field
  // left the deadline at its old value, so a LARGER timeout made the agent
  // give up before the browser's own timeout ever fired. Re-derive it the same
  // way the constructor does.
  if (field === 'answerTimeoutMs' && 'askDeadlineMs' in browser) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      browser.askDeadlineMs = value + 60_000
    }
  }
  return true
}

/** Push undo.* / checkpoint.* changes onto the live stores. The stores copy
 *  their config at construction, so a change must be written to the instance
 *  too. */
export function applyStoreLiveConfig(
  path: string,
  value: unknown,
  stores: {
    undo?: Record<string, unknown> | null
    checkpoints?: Record<string, unknown> | null
  },
): boolean {
  if (path === 'undo.enabled' || path === 'undo.maxBackups') {
    if (!stores.undo) return false
    stores.undo[path === 'undo.enabled' ? 'enabled' : 'maxBackups'] = value
    return true
  }
  if (path === 'checkpoint.enabled' || path === 'checkpoint.maxBackups') {
    if (!stores.checkpoints) return false
    stores.checkpoints[
      path === 'checkpoint.enabled' ? 'enabled' : 'maxBackups'
    ] = value
    return true
  }
  return false
}
