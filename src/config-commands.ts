// PURE rendering for the /config command's TEXT output (BACKLOG C3). These
// helpers format the schema into lines; they touch no browser/terminal state,
// so they are unit-tested without a live agent (the /config dispatch in
// index.ts only prints what these return). The interactive menu lives in
// config-menu.ts; the value read/write policy lives in config.ts.

import { theme } from './theme.js'
import type { TranslateFn } from './i18n.js'
import type { ConfigField } from './config.js'

/**
 * The value shown for a field in the LIST: the default marker, on/off for a
 * boolean, a fixed mask for a password, otherwise the JSON form. Mirrors the
 * long-used inline logic so the output is byte-for-byte identical.
 */
export function configListValue(
  field: ConfigField,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (typeof value === 'boolean')
    return value ? t('common.on') : t('common.off')
  if (/password/i.test(field.path) && String(value).length > 0)
    return '********'
  return JSON.stringify(value)
}

/**
 * The value shown for `/config get <path>`: the default marker, a fixed mask
 * for a password, otherwise the JSON form. Note this deliberately does NOT
 * special-case booleans (the get subcommand has always printed true/false).
 */
export function configGetValue(
  path: string,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (/password/i.test(path) && String(value).length > 0) return '********'
  return JSON.stringify(value)
}

/**
 * Human-readable hint of the accepted values for a field, used in the error
 * message when /config set gets a bad value. Enum -> the allowed list,
 * number -> a range, boolean -> "true|false".
 */
export function configValueHint(field: ConfigField, t: TranslateFn): string {
  if (field.values && field.values.length) return field.values.join('|')
  if (field.type === 'boolean') return 'true|false'
  if (field.type === 'number') {
    const lo = field.min !== undefined ? String(field.min) : '-'
    const hi = field.max !== undefined ? String(field.max) : '-'
    return t('cfg.range_hint', { min: lo, max: hi })
  }
  return field.type
}

/**
 * Render the full settings LIST as an array of lines (grouped by section).
 * `get` reads the current value of a path (undefined = default). Returned as
 * lines so index.ts only has to print them and the formatting is testable.
 */
export function formatConfigList(
  fields: ConfigField[],
  get: (path: string) => unknown,
  t: TranslateFn,
): string[] {
  const out: string[] = [theme.system(t('cfg.title'))]
  let lastGroup = ''
  for (const f of fields) {
    const g = t(f.groupKey)
    if (g !== lastGroup) {
      out.push(theme.system('\n  ' + g))
      lastGroup = g
    }
    const shown = configListValue(f, get(f.path), t)
    const extra = f.values ? '  [' + f.values.join('|') + ']' : ''
    out.push(
      '    ' +
        theme.user(f.path) +
        theme.dim(' = ') +
        theme.assistant(shown) +
        theme.dim(extra) +
        theme.dim('   # ' + t(f.labelKey)),
    )
  }
  out.push(theme.dim('\n' + t('cfg.usage')))
  return out
}
