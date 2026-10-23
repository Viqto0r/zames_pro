import {
  providerHasModelPicker,
  providerLabel,
  isProviderId,
  PROVIDER_IDS,
  type ProviderId,
} from './providers.js'
import { translate, type TranslateFn } from './i18n.js'

// Pure half of `/provider <arg>`. The main loop only executes a switch (launch
// a browser, summarize a chat); the DECISION of what the argument means lives
// here so every branch is unit-tested without a backend.

export type ProviderIntent =
  /** `/provider` or `/provider status` — print the current state. */
  | { kind: 'status' }
  /** `/provider login` — re-check the sign-in. */
  | { kind: 'login' }
  /** `/provider <known id>` — switch (or report it is already active). */
  | { kind: 'switch'; provider: ProviderId; same: boolean }
  /** Unknown argument — show the usage line. */
  | { kind: 'usage' }

/** Parse the text after `/provider` into an intent. `current` is the ACTIVE id. */
export function parseProviderIntent(
  arg: string,
  current: string,
): ProviderIntent {
  const a = String(arg ?? '')
    .trim()
    .toLowerCase()
  if (!a || a === 'status') return { kind: 'status' }
  if (a === 'login') return { kind: 'login' }
  if (isProviderId(a))
    return { kind: 'switch', provider: a, same: a === current }
  return { kind: 'usage' }
}

/** The usage line for an unknown `/provider` argument. */
export function providerUsageMessage(t: TranslateFn = translate('en')): string {
  return t('provider.usage', { providers: PROVIDER_IDS.join('|') })
}

/**
 * Why a provider with no model picker cannot be selected via `/model`.
 * (Kept here as well as in model-command so the two commands share the
 * capability check instead of each hardcoding a provider id.)
 */
export function providerWithoutPickerMessage(
  provider: string,
  t: TranslateFn = translate('en'),
): string | null {
  if (providerHasModelPicker(provider)) return null
  return t('model.unsupported', { provider: providerLabel(provider) })
}
