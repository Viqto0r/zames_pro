// Mount the REAL Ink config menu with the REAL schema and callbacks so a pty
// run can screenshot it and drive it (toggle a boolean, cycle an enum, open an
// edit prompt) — the menu is otherwise only reachable from a live agent.

import React from 'react'
import fs from 'node:fs'
import { render } from 'ink'
import { ConfigMenuApp } from '../src/tui/ConfigMenu.js'
import {
  CONFIG_SCHEMA,
  DEFAULTS,
  validateConfigValue,
  type ConfigField,
} from '../src/config.js'
import { translate } from '../src/i18n.js'

const LOG = process.env.PROBE_CONFIG_LOG || '/tmp/config-probe.log'
// A tiny in-memory config so get/set/reset are real (validate + default).
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
      obj,
    )
}
function setByPath(path: string, value: unknown): void {
  const parts = path.split('.')
  let o: Record<string, unknown> = cfg
  for (let i = 0; i < parts.length - 1; i++) {
    o[parts[i]] = o[parts[i]] ?? {}
    o = o[parts[i]] as Record<string, unknown>
  }
  o[parts[parts.length - 1]] = value
}
const cfg: Record<string, unknown> = {}
// Seed a few NESTED values so toggling is observable (the menu reads through
// getByPath, which walks the path — a flat key would never be found).
setByPath('ui.locale', 'ru')
setByPath('ui.tui', true)
setByPath('ui.alternateScreen', true)
setByPath('ui.mouseScroll', false)
setByPath('maxIterations', 0)
setByPath('headless', true)
setByPath('provider', 'deepseek')

const log = (line: string): void => {
  fs.appendFileSync(LOG, line + String.fromCharCode(10))
}

render(
  React.createElement(ConfigMenuApp, {
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (p: string) => getByPath(cfg, p),
    getDefault: (p: string) =>
      getByPath(DEFAULTS as unknown as Record<string, unknown>, p),
    set: (field: ConfigField, raw: string) => {
      const v = validateConfigValue(field, raw)
      setByPath(field.path, v)
      log('SET ' + field.path + '=' + JSON.stringify(v))
    },
    reset: (field: ConfigField) => {
      setByPath(
        field.path,
        getByPath(DEFAULTS as unknown as Record<string, unknown>, field.path),
      )
      log('RESET ' + field.path)
    },
    onExit: () => log('EXIT'),
  }),
  { exitOnCtrlC: false, patchConsole: false },
)
setInterval(() => {}, 1 << 30)
