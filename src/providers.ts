// Provider registry — the SINGLE source of truth for the chat backends zames
// can drive. Adding a new backend (ChatGPT, Gemini, …) means:
//   1. add an entry here (id, label, chat URL prefix, extra config section);
//   2. add the provider's `<name>-ui.ts` + `<name>-net-capture.ts` +
//      `<name>-browser.ts` (implementing ChatProvider, see types.ts);
//   3. register the class in `createBrowser()` in index.ts.
// Everything else (config enum, /provider validation, sessions tagging, the
// /doctor row, the {provider} label in operator messages, /chat URL) reads
// from HERE, so nothing else has to be touched.
//
// This module is PURE (no imports, no side effects) so it can be imported from
// anywhere without pulling in Playwright.

export type ProviderId = 'deepseek' | 'qwen'

export interface ProviderMeta {
  id: ProviderId
  /** Human label used in operator messages and /doctor ('Qwen', 'DeepSeek'). */
  label: string
  /** Base URL for the current chat, used by /chat to print a link. */
  chatUrlPrefix: string
  /** The default provider (used when the config has no value). */
  isDefault: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    chatUrlPrefix: 'https://chat.deepseek.com/a/chat/s',
    isDefault: true,
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    chatUrlPrefix: 'https://chat.qwen.ai/c',
    isDefault: false,
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
