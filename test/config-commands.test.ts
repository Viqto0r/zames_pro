import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n.ts'
import type { ConfigField } from '../src/config.ts'
import {
  configGetValue,
  configListValue,
  configValueHint,
  formatConfigList,
} from '../src/config-commands.ts'

const t = translate('en')

const enumField: ConfigField = {
  path: 'ui.locale',
  type: 'enum',
  values: ['ru', 'en'],
  labelKey: 'cfg.f.ui_locale',
  groupKey: 'cfg.group.ui',
}
const boolField: ConfigField = {
  path: 'undo.enabled',
  type: 'boolean',
  labelKey: 'cfg.f.undo_enabled',
  groupKey: 'cfg.group.undo',
}
const numField: ConfigField = {
  path: 'maxIterations',
  type: 'number',
  min: 0,
  max: 100,
  labelKey: 'cfg.f.maxIterations',
  groupKey: 'cfg.group.agent',
}
const pwField: ConfigField = {
  path: 'browser.auth.password',
  type: 'string',
  labelKey: 'cfg.f.browser_auth_password',
  groupKey: 'cfg.group.browser',
}

test('configListValue: default marker / on-off / mask / JSON', () => {
  assert.equal(configListValue(boolField, undefined, t), t('cfg.menu.default'))
  assert.equal(configListValue(boolField, true, t), t('common.on'))
  assert.equal(configListValue(boolField, false, t), t('common.off'))
  assert.equal(configListValue(numField, 5, t), '5')
  assert.equal(configListValue(pwField, 'secret', t), '********')
  assert.equal(configListValue(pwField, '', t), '""')
})

test('configGetValue: default marker / mask / JSON (no on-off)', () => {
  assert.equal(configGetValue('ui.locale', undefined, t), t('cfg.menu.default'))
  // get never maps booleans to on/off, it prints the JSON form.
  assert.equal(configGetValue('undo.enabled', true, t), 'true')
  assert.equal(configGetValue('browser.auth.password', 'x', t), '********')
  assert.equal(configGetValue('ui.answerWidth', 0, t), '0')
})

test('configValueHint: enum list / boolean / number range / type', () => {
  assert.equal(configValueHint(enumField, t), 'ru|en')
  assert.equal(configValueHint(boolField, t), 'true|false')
  assert.equal(
    configValueHint(numField, t),
    t('cfg.range_hint', { min: '0', max: '100' }),
  )
  const openNum: ConfigField = { ...numField, min: undefined, max: undefined }
  assert.equal(
    configValueHint(openNum, t),
    t('cfg.range_hint', { min: '-', max: '-' }),
  )
  const strField: ConfigField = {
    path: 'ui.statusLineCommand',
    type: 'string',
    labelKey: 'cfg.f.ui_statusLineCommand',
    groupKey: 'cfg.group.ui',
  }
  assert.equal(configValueHint(strField, t), 'string')
})

test('formatConfigList: groups headers, one line per field, trailing usage', () => {
  const values: Record<string, unknown> = {
    'ui.locale': 'en',
    'undo.enabled': true,
  }
  const lines = formatConfigList(
    [enumField, boolField, numField],
    (p) => values[p],
    t,
  )
  // Title first, usage last.
  assert.equal(lines[0], t('cfg.title'))
  assert.ok(lines[lines.length - 1].includes(t('cfg.usage')))
  // A line per field, plus the title, three group headers (ui/undo/agent)
  // and the usage line.
  assert.equal(lines.length, 1 + 3 + 3 + 1)
  // The enum line carries the allowed-values annotation and the label.
  const enumLine = lines.find((l) => l.includes('ui.locale'))!
  assert.ok(enumLine.includes('ru|en'))
  assert.ok(enumLine.includes(t('cfg.f.ui_locale')))
})

test('formatConfigList: empty schema still yields title + usage', () => {
  const lines = formatConfigList([], () => undefined, t)
  assert.equal(lines.length, 2)
  assert.equal(lines[0], t('cfg.title'))
})
