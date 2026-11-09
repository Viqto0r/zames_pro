import { test } from 'node:test'
import assert from 'node:assert/strict'

// `src/types.ts` is TYPES ONLY (the header says so explicitly): it has no
// runtime statements, so it never shows up in the coverage report and cannot
// have a behavioural test. What CAN rot silently is the CONTRACT the rest of
// the tree compiles against — a union gaining a member that nothing accepts, a
// config section drifting away from the shape the menu reads. These checks are
// compile-time (the imports below fail the typecheck the moment a name or a
// field disappears) plus a few runtime guards on the string unions that are
// also validated at runtime (`isThemeName`, `resolvePasswordStore`, provider
// ids), because THOSE are the values a hand-edited config can carry.

import type {
  BrowserConfig,
  BrowserLike,
  ChatMessage,
  ChatProvider,
  DeepPartial,
  DiagnosticsConfig,
  GlmConfig,
  ParsedToolCall,
  ProviderAuthConfig,
  QwenConfig,
  Session,
  ThemeName,
  ToolArgs,
  ToolCall,
  ToolDef,
  ToolParameters,
  UiConfig,
  ZamesConfig,
} from '../src/types.ts'
import { isThemeName, themeNames, DEFAULT_THEME } from '../src/theme.ts'
import { resolvePasswordStore } from '../src/password-store.ts'

test('the exported contract types are still importable and shaped as before', () => {
  // A tool definition, exactly as the registry builds it.
  const def: ToolDef = {
    name: 'X',
    description: 'd',
    parameters: { path: 'string' } satisfies ToolParameters,
    fn: async (args: ToolArgs) => args,
  }
  assert.equal(def.name, 'X')

  // A parsed tool call may be one call, an array or null.
  const one: ParsedToolCall = { tool: 'X', args: {} } satisfies ToolCall
  const many: ParsedToolCall = [one as ToolCall]
  const none: ParsedToolCall = null
  assert.ok(one && Array.isArray(many) && none === null)

  // A chat turn carries ONLY a role and the text.
  const msg: ChatMessage = { role: 'assistant', text: 'hi' }
  assert.equal(msg.role, 'assistant')

  // Per-provider credentials are the same three fields everywhere, so the
  // menu and the login path can share one renderer.
  const auth: ProviderAuthConfig = {
    username: 'u',
    password: 'p',
    saveSession: true,
  }
  assert.deepEqual(Object.keys(auth).sort(), [
    'password',
    'saveSession',
    'username',
  ])

  // DeepPartial is recursive: a nested section may be given partially.
  const partial: DeepPartial<ZamesConfig> = {
    browser: { answerTimeoutMs: 1000 },
    glm: { model: 'glm-4.5' },
  }
  assert.ok(partial.browser && partial.glm)
})

test('the config sections keep the knobs the menu and the loop read', () => {
  // Compile-time presence checks: a removed field breaks the build here.
  type BrowserKeys = keyof BrowserConfig
  type UiKeys = keyof UiConfig
  type GlmKeys = keyof GlmConfig
  type QwenKeys = keyof QwenConfig
  type DiagKeys = keyof DiagnosticsConfig
  type SessionKeys = keyof Session
  const browser: Array<BrowserKeys> = [
    'passwordStore',
    'fallbackProviders',
    'fallbackMode',
    'answerTimeoutMs',
    'askRetries',
    'minSendIntervalMs',
    'rateLimitWaitMs',
    'maxRateLimitRetries',
    'maxIncompleteRetries',
    'loginTimeoutMs',
    'askDeadlineMs',
    'maxAfterToolRetries',
    'infiniteRetries',
    'maxRetryWaitMs',
    'autoCompact',
    'autoCompactPct',
    'subagents',
    'maxSubagents',
    'deepThinking',
    'webSearch',
    'sendTelemetry',
    'auth',
  ]
  const ui: Array<UiKeys> = ['theme']
  const glm: Array<GlmKeys> = ['model', 'contextLimit', 'auth']
  const qwen: Array<QwenKeys> = ['model', 'enabled', 'auth']
  const diag: Array<DiagKeys> = []
  const session: Array<SessionKeys> = []
  assert.equal(browser.length, 22)
  assert.ok(ui.includes('theme'))
  assert.ok(glm.includes('model'))
  assert.ok(qwen.includes('enabled'))
  assert.equal(diag.length + session.length, 0)
})

test('the ChatProvider contract still matches what the agent loop calls', () => {
  // Every member below is CALLED by agent-loop/index; renaming one without
  // updating the implementations breaks the build here first.
  type Keys = keyof ChatProvider
  const used: Array<Keys> = [
    'providerName',
    'resumeChatId',
    'newChat',
    'stopGeneration',
    'getCurrentChatId',
    'listChats',
    'openChat',
    'readChatMessages',
    'fetchChatMessages',
    'getLastTokenUsage',
    'launch',
    'waitForLogin',
    'close',
    'probeUiHealth',
    'dumpDom',
    'setLocale',
    'getToggleStatesSync',
    'setToggleState',
    'sendIntervalMs',
    '_abort',
    '_stopped',
    '_lastHistoryError',
  ]
  // The hooks below live on BrowserLike (optional there) and are what the
  // UI and the agent loop attach; a rename breaks the build here first.
  type LooseKeys = keyof BrowserLike
  const hooks: Array<LooseKeys> = [
    'ask',
    'onSendStart',
    'onSendPause',
    'onNotice',
    'onSendState',
    'cancelPendingAsk',
  ]
  assert.equal(hooks.length, 6)
  assert.equal(used.length, 22)
})

test('every ThemeName is a palette the runtime accepts', () => {
  const names: ThemeName[] = themeNames()
  assert.ok(names.length >= 20)
  for (const n of names) {
    assert.equal(isThemeName(n), true, n)
  }
  // The default must be one of them, or a fresh install would start unstyled.
  assert.ok(names.includes(DEFAULT_THEME))
  assert.equal(isThemeName(DEFAULT_THEME), true)
})

test('isThemeName rejects everything that is not a shipped palette', () => {
  for (const bad of [null, undefined, 42, {}, [], '', 'no-such-theme']) {
    assert.equal(isThemeName(bad), false, String(bad))
  }
  // Case matters: the ids are lowercase slugs.
  assert.equal(isThemeName('Zames'), false)
})

test('the password-store union is the one resolvePasswordStore accepts', () => {
  // The three literals in `BrowserConfig.passwordStore` are exactly the ones
  // the resolver branches on; a fourth value would silently fall through.
  const probe = {
    secretTool: false,
    security: false,
    powershell: false,
    platform: 'other' as const,
  }
  for (const store of ['none', 'keychain', 'config'] as const) {
    const res = resolvePasswordStore(store, probe)
    assert.ok(
      res.store === 'none' || res.store === 'config',
      'unexpected store for ' + store,
    )
  }
  // `keychain` with no tool degrades to `config` WITH a warning instead of
  // dropping the password.
  assert.deepEqual(resolvePasswordStore('keychain', probe), {
    store: 'config',
    degraded: true,
  })
})
