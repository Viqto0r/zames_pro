import { providerHasModelPicker } from './providers.js'
import { translate, type TranslateFn } from './i18n.js'

// Pure half of /model. index.ts cannot be unit-tested (it owns the browser and
// the config), so the decisions that decide what /model does — is the provider
// capable at all, what arg it was given, what to print for an empty list —
// live here as one testable step.

export type ModelIntent =
  /** Print the list of models (or a picker in the TUI). */
  | { kind: 'list' }
  /** The provider has no model picker; explain and stop. */
  | { kind: 'unsupported'; message: string }
  /** An explicit model id was given. */
  | { kind: 'set'; model: string }

/**
 * Decide what /model should do from the command argument and the provider.
 * The argument is the text after "/model" (trimmed here again); an empty
 * argument means "list".
 */
export function parseModelIntent(
  provider: string,
  arg: string,
  t: TranslateFn = translate('en'),
): ModelIntent {
  if (!providerHasModelPicker(provider)) {
    return {
      kind: 'unsupported',
      message: t('model.unsupported', { provider }),
    }
  }
  const model = String(arg ?? '').trim()
  return model ? { kind: 'set', model } : { kind: 'list' }
}

/** The text for an EMPTY model list (a provider that answered with nothing). */
export function emptyModelListMessage(
  t: TranslateFn = translate('en'),
): string {
  return t('model.list', { v: '(none)' })
}
