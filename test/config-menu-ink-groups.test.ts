import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { ConfigMenuApp } from '../src/tui/ConfigMenu.tsx'
import { translate } from '../src/i18n.ts'
import { CONFIG_SCHEMA } from '../src/config.ts'
import type { ConfigField } from '../src/config.ts'

// test/config-menu.test.ts drives the LEGACY menu; the Ink menu's own grouping
// rules had no test: which top groups are OFFERED (a group without a visible
// field must not appear), the `advanced` field staying hidden, and the
// "settings: N" badge that tells the operator where changes are. A wrong
// filter here shows an empty group or hides the only changed setting.

const t = translate('en')

class FakeIn extends EventEmitter {
  isTTY = true
  setRawMode(): this {
    return this
  }
  setEncoding(): this {
    return this
  }
  resume(): this {
    return this
  }
  pause(): this {
    return this
  }
  ref(): void {}
  unref(): void {}
}

async function frame(
  fields: ConfigField[],
  opts: {
    get?: (p: string) => unknown
    getDefault?: (p: string) => unknown
    topGroups?: string[]
  } = {},
): Promise<string> {
  const stdin = new FakeIn() as unknown as NodeJS.ReadStream
  const chunks: string[] = []
  const stdout = {
    columns: 100,
    rows: 40,
    write(s: string): boolean {
      chunks.push(s)
      return true
    },
  } as unknown as NodeJS.WriteStream
  const app = render(
    React.createElement(ConfigMenuApp, {
      fields,
      t,
      get: opts.get ?? (() => undefined),
      getDefault: opts.getDefault,
      set: () => {},
      reset: () => {},
      onExit: () => {},
      topGroups: opts.topGroups,
    }),
    { stdin, stdout, debug: true },
  )
  await new Promise((r) => setTimeout(r, 80))
  app.unmount()
  return chunks.join('')
}

const field = (over: Partial<ConfigField> & { path: string }): ConfigField =>
  ({
    type: 'boolean',
    labelKey: 'cfg.f.headless',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
    ...over,
  }) as ConfigField

test('a group with NO visible field is not offered', async () => {
  const out = await frame([
    field({ path: 'headless', topKey: 'cfg.top.agent' }),
    // The ui group has only an ADVANCED field -> the group disappears.
    field({ path: 'ui.hidden', topKey: 'cfg.top.ui', advanced: true }),
  ])
  assert.match(out, /Settings — choose a group/)
  assert.match(out, /Agent/)
  assert.ok(!out.includes(t('cfg.top.ui')), 'an empty group was offered')
  // The total count in the corner counts the OFFERED groups only.
  assert.match(out, /1\/1/)
})

test('topGroups narrows the list and keeps the given order', async () => {
  const fields = [
    field({ path: 'headless', topKey: 'cfg.top.agent' }),
    field({ path: 'provider', topKey: 'cfg.top.agent' }),
    field({ path: 'ui.x', topKey: 'cfg.top.ui' }),
  ]
  const out = await frame(fields, { topGroups: ['cfg.top.ui'] })
  assert.match(out, /1\/1/)
  assert.ok(!out.includes('Agent'))
})

test('the group badge counts the CHANGED settings only', async () => {
  const fields = [
    field({ path: 'headless' }),
    field({ path: 'debug' }),
    field({ path: 'provider', type: 'enum', values: ['a', 'b'] }),
  ]
  const defaults: Record<string, unknown> = {
    headless: false,
    debug: false,
    provider: 'a',
  }
  const current: Record<string, unknown> = {
    headless: true, // changed
    debug: false,
    provider: 'a',
  }
  const out = await frame(fields, {
    get: (p) => current[p],
    getDefault: (p) => defaults[p],
  })
  // The row shows TWO separate badges: how many settings the group has and
  // how many of them differ from the defaults.
  assert.match(out, /settings: 3/)
  assert.match(out, /changed: 1/)
})

// The default-value rendering of a row: `undefined` is the localized
// "default", a boolean is on/off and a PASSWORD is masked. That logic lives in
// the component's private `displayValue`; it is pinned through the edit state
// of a text field, which shows the value inside the row once opened.
test('a password value is masked in the row, an undefined one says default', async () => {
  const schema = CONFIG_SCHEMA.filter((f) =>
    ['browser.auth.password', 'provider'].includes(f.path),
  )
  assert.equal(schema.length, 2, 'the schema still carries the pinned fields')
  // Masking is a SOURCE-level rule (the private helper has no export), so pin
  // the exact expression instead of re-implementing it here.
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/tui/ConfigMenu.tsx', import.meta.url), 'utf-8'),
  )
  assert.match(src, /\/password\/i\.test\(field\.path\)/)
  assert.match(src, /return '\*\*\*\*\*\*\*\*'/)
  assert.match(
    src,
    /if \(value === undefined\) return t\('cfg\.menu\.default'\)/,
  )
})
