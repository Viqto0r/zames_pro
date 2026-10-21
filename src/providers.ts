// Provider registry — the SINGLE source of truth for the chat backends zames
// can drive. Adding a new backend (ChatGPT, Gemini, …) means:
//   1. add an entry here (id, label, chat URL prefix, extra config section);
//   2. add the provider's `<name>-ui.ts` + `<name>-net-capture.ts` +
//      `<name>-browser.ts` (implementing ChatProvider, see types.ts);
//   3. register the class in `createProviderBrowser()` in index.ts.
// Everything else (config enum, /provider validation, sessions tagging, the
// /doctor row, the {provider} label in operator messages, /chat URL) reads
// from HERE, so nothing else has to be touched.
//
// CAPABILITY FLAGS: the code used to ask `provider === 'qwen'` in a dozen
// places, which made "there are exactly two backends" a silent assumption and
// broke the moment a third one arrived. The flags below are that knowledge,
// stated once per provider, so every call site asks a CAPABILITY instead.
//
// This module is PURE (no imports, no side effects) so it can be imported from
// anywhere without pulling in Playwright.

export type ProviderId = 'deepseek' | 'qwen' | 'glm'

export interface ProviderMeta {
  id: ProviderId
  /** Human label used in operator messages and /doctor ('Qwen', 'DeepSeek'). */
  label: string
  /** Base URL for the current chat, used by /chat to print a link. */
  chatUrlPrefix: string
  /** The default provider (used when the config has no value). */
  isDefault: boolean
  /**
   * The provider's chat page exposes a MODEL picker (`/model`). DeepSeek has
   * no model selection outside its own web UI, so this is false there.
   */
  hasModelPicker: boolean
  /**
   * The site answers a signed-OUT visitor (a guest) at all. A guest session is
   * usable for a few turns, so a login failure does not have to abort the run.
   */
  guestAllowed: boolean
  /** Persistent Chromium profile directory for this provider. */
  profileDir: string
  /**
   * The site refuses HEADLESS automation: z.ai answers every send with an
   * Aliyun slider captcha that only a human in a visible window can pass
   * (measured: the SAME signed-in session sends fine headed and fails
   * headless). So this provider runs headed by default.
   */
  needsVisibleBrowser: boolean
  /** Operator-facing URL of the provider's chat home page. */
  chatUrl: string
  /**
   * The regexp source that finds this provider's chat id in the page URL.
   * Kept as a string so the registry stays free of runtime objects (the
   * provider's own `*-ui.ts` owns the compiled RegExp and the URL builder).
   */
  chatIdPattern: string
}

import path from 'path'
import os from 'os'

/** `~/.zames/<dir>` — the per-provider profile location. */
function zamesProfile(dir: string): string {
  return path.join(os.homedir(), '.zames', dir)
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    chatUrlPrefix: 'https://chat.deepseek.com/a/chat/s',
    chatUrl: 'https://chat.deepseek.com/',
    chatIdPattern: '/a/chat/s/([A-Za-z0-9_-]+)',
    isDefault: true,
    hasModelPicker: false,
    guestAllowed: false,
    profileDir: zamesProfile('profile'),
    needsVisibleBrowser: false,
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    chatUrlPrefix: 'https://chat.qwen.ai/c',
    chatUrl: 'https://chat.qwen.ai/',
    chatIdPattern: '/c/([A-Za-z0-9_-]+)',
    isDefault: false,
    hasModelPicker: true,
    guestAllowed: true,
    profileDir: zamesProfile('qwen-profile'),
    needsVisibleBrowser: false,
  },
  glm: {
    id: 'glm',
    label: 'GLM',
    chatUrlPrefix: 'https://chat.z.ai/c',
    chatUrl: 'https://chat.z.ai/',
    chatIdPattern: '/c/([A-Za-z0-9_-]+)',
    isDefault: false,
    hasModelPicker: true,
    guestAllowed: true,
    profileDir: zamesProfile('glm-profile'),
    needsVisibleBrowser: true,
  },
}

/** All provider ids, in a stable order (default first). */
export const PROVIDER_IDS: ProviderId[] = (
  Object.keys(PROVIDERS) as ProviderId[]
).sort((a, b) =>
  PROVIDERS[a].isDefault === PROVIDERS[b].isDefault
    ? a.localeCompare(b)
    : PROVIDERS[a].isDefault
      ? -1
      : 1,
)

/** True when `v` is a known provider id. Narrows the type for callers. */
export function isProviderId(v: unknown): v is ProviderId {
  return (
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, v)
  )
}

/** Resolve an unknown value to a provider id, falling back to the default. */
export function asProviderId(v: unknown): ProviderId {
  if (isProviderId(v)) return v
  return PROVIDER_IDS.find((id) => PROVIDERS[id].isDefault) || PROVIDER_IDS[0]
}

/** The human label of a provider ('Qwen', 'DeepSeek'). */
export function providerLabel(id: ProviderId | string): string {
  return isProviderId(id) ? PROVIDERS[id].label : String(id)
}

/** The base chat URL of a provider, used by /chat. */
export function providerChatUrlPrefix(id: ProviderId | string): string {
  return isProviderId(id) ? PROVIDERS[id].chatUrlPrefix : ''
}

/** The provider's config section name (`qwen`, `glm`, …) or null for DeepSeek. */
export function providerConfigSection(id: ProviderId): ProviderId | null {
  // DeepSeek's shared settings live in `browser`; the other backends own a
  // per-provider section (qwen.*, glm.*).
  return id === 'deepseek' ? null : id
}

/** True when the provider exposes a model picker (`/model`). */
export function providerHasModelPicker(id: ProviderId | string): boolean {
  return isProviderId(id) ? PROVIDERS[id].hasModelPicker : false
}

/** True when an unsigned (guest) visitor is usable on the site. */
export function providerGuestAllowed(id: ProviderId | string): boolean {
  return isProviderId(id) ? PROVIDERS[id].guestAllowed : false
}

/** The persistent profile directory of a provider. */
/** True when the provider needs a VISIBLE browser (a headless captcha). */
export function providerNeedsVisibleBrowser(
  id: ProviderId | string,
): boolean {
  return isProviderId(id) ? PROVIDERS[id].needsVisibleBrowser : false
}

export function providerProfileDir(id: ProviderId | string): string {
  return isProviderId(id) ? PROVIDERS[id].profileDir : ''
}

/** The chat home URL of a provider. */
export function providerChatUrl(id: ProviderId | string): string {
  return isProviderId(id) ? PROVIDERS[id].chatUrl : ''
}

/** A provider's chat-id matcher (compiled from the registry pattern). */
export function providerChatIdRe(id: ProviderId): RegExp {
  return new RegExp(PROVIDERS[id].chatIdPattern)
}
