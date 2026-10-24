// The /config subcommand DISPATCH. The PURE text rendering lives
// in config-commands.ts; this module owns the parsing/routing of the text
// subcommands (list/get/set/reset/lang/path) and prints through injected
// callbacks. Everything that touches live state (the runtime config object,
// the browser toggles, the LineEditor, the interactive menu) is injected, so
// the dispatch itself is unit-tested without a live agent.
//
// The interactive menu (`/config` bare or `menu`) is delegated to openMenu()
// because it pauses the editor and reads keys itself.

import { theme } from './theme.js'
import type { Locale, TranslateFn } from './i18n.js'
import type { ConfigField } from './config.js'
import { configGetValue, configValueHint } from './config-commands.js'

export interface ConfigCommandDeps {
  t: TranslateFn
  /** Print a normal line (above the input line while the editor is active). */
  print: (line: string) => void
  /** Print an error line. */
  printErr: (line: string) => void
  /** Current runtime value of a path (undefined = default). */
  getValue: (path: string) => unknown
  /** Validate + persist + apply a value live (throws on a bad value). */
  setValue: (field: ConfigField, raw: string) => void
  /** Reset a field to its default (throws on a write error). */
  resetField: (field: ConfigField) => void
  /** Print the full settings list (grouped). */
  showList: () => void
  /** Open the interactive menu (or fall back to the list in non-TTY). */
  openMenu: () => Promise<void>
  /** Current locale (for `/config lang` with no argument). */
  currentLocale: () => Locale
  normalizeLocale: (v: unknown) => Locale
  localeDisplayName: (l: Locale) => string
  /** Schema to dispatch against (CONFIG_SCHEMA in production). */
  schema: ConfigField[]
  /** Config file paths shown by `/config path` and the saved line. */
  homeConfigPath: string
  projectConfigPath: string
}

/**
 * Handle a `/config <sub>` text command. Never throws for a bad subcommand or
 * argument: it prints a message and returns, so the caller can `await` it
 * blindly from the main loop and from the live mid-run interception.
 */
export async function handleConfigCommand(
  input: string,
  deps: ConfigCommandDeps,
): Promise<void> {
  const {
    t,
    print,
    printErr,
    getValue,
    setValue,
    resetField,
    showList,
    openMenu,
    currentLocale,
    normalizeLocale,
    localeDisplayName,
    homeConfigPath,
    projectConfigPath,
  } = deps
  const schema = deps.schema
  // Accept BOTH spellings: the main loop passes the whole typed line
  // (`/config get ui.locale`), while tests and other callers pass the text
  // after the command (`get ui.locale`). Reading parts[1] blindly made the
  // second form treat `get` as the subcommand.
  const all = input.trim().split(/\s+/).filter(Boolean)
  const parts = /^\/config(\s|$)/i.test(input.trim())
    ? all
    : ['/config', ...all]
  const sub = (parts[1] || '').toLowerCase()

  // Bare `/config` opens the menu (a text list in non-TTY, via openMenu).
  if (!sub || sub === 'menu') {
    await openMenu()
    return
  }

  if (sub === 'list' || sub === 'show' || sub === 'ls') {
    showList()
    return
  }

  if (sub === 'path' || sub === 'paths') {
    print(
      theme.system(
        t('cfg.paths', { global: homeConfigPath, project: projectConfigPath }),
      ),
    )
    return
  }

  // `/config lang <ru|en>` is a shortcut for `set ui.locale`; `язык` is an
  // accepted alias because the operator types the command in their own language.
  if (sub === 'lang' || sub === 'language' || sub === 'язык') {
    const val = parts[2]
    if (!val) {
      print(
        theme.system(
          t('status.locale', { v: localeDisplayName(currentLocale()) }),
        ),
      )
      print(theme.dim(t('cfg.lang_usage')))
      return
    }
    const field = schema.find((f) => f.path === 'ui.locale')
    if (!field) return
    const loc = normalizeLocale(val)
    try {
      setValue(field, loc)
    } catch (e) {
      printErr(theme.error(t('cfg.write_error', { v: (e as Error).message })))
      return
    }
    print(theme.assistant(t('cfg.lang_set', { v: localeDisplayName(loc) })))
    return
  }

  if (sub === 'get') {
    const key = parts[2]
    if (!key) {
      print(theme.dim(t('cfg.usage')))
      return
    }
    const field = schema.find((f) => f.path === key)
    if (!field) {
      printErr(theme.error(t('cfg.unknown_key', { v: key })))
      return
    }
    const cur = getValue(key)
    print(
      theme.system(
        t('cfg.value', { v: key, value: configGetValue(key, cur, t) }),
      ),
    )
    return
  }

  if (sub === 'set') {
    const key = parts[2]
    const raw = parts.slice(3).join(' ')
    const field = schema.find((f) => f.path === key)
    if (!field) {
      printErr(theme.error(t('cfg.unknown_key', { v: key || '' })))
      return
    }
    if (!raw) {
      print(theme.dim(t('cfg.usage')))
      return
    }
    try {
      setValue(field, raw)
    } catch {
      printErr(
        theme.error(
          t('cfg.bad_value', { v: key, type: configValueHint(field, t) }),
        ),
      )
      return
    }
    print(
      theme.assistant(
        t('cfg.saved', {
          v: key,
          // Mask a SECRET here too: this line goes to the terminal scrollback,
          // the transcript and screenshots. `configGetValue` already masks the
          // password for /config get and the list, but the save confirmation
          // echoed it in the clear.
          value: configGetValue(key, getValue(key), t),
          file: homeConfigPath,
        }),
      ),
    )
    return
  }

  if (sub === 'reset' || sub === 'unset') {
    const key = parts[2]
    const field = schema.find((f) => f.path === key)
    if (!field) {
      printErr(theme.error(t('cfg.unknown_key', { v: key || '' })))
      return
    }
    try {
      resetField(field)
    } catch (e) {
      printErr(theme.error(t('cfg.write_error', { v: (e as Error).message })))
      return
    }
    print(theme.assistant(t('cfg.reset', { v: key })))
    return
  }

  // An unknown subcommand reports the key AND shows the list, so the operator
  // sees the valid keys without a second command.
  printErr(theme.error(t('cfg.unknown_key', { v: sub })))
  showList()
}
