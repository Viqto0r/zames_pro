// Unit tests for the startup banner (src/banner.ts). Pure string building, so
// it is tested without a terminal: the box must stay within the target width
// and include every field.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderStartupBanner } from '../src/banner.js'
import { visLen } from '../src/input/layout.js'

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

test('banner: содержит все поля', () => {
  const out = stripAnsi(
    renderStartupBanner(
      {
        title: 'zames',
        version: '1.2.3',
        workdir: '/tmp/proj',
        provider: 'DeepSeek',
        hint: 'help hint',
      },
      100,
    ),
  )
  assert.match(out, /zames/)
  assert.match(out, /1\.2\.3/)
  assert.match(out, /\/tmp\/proj/)
  assert.match(out, /DeepSeek/)
  assert.match(out, /help hint/)
  assert.match(out, /╭/)
  assert.match(out, /╰/)
})

test('banner: не превышает заданную ширину', () => {
  const out = stripAnsi(
    renderStartupBanner(
      {
        title: 'zames',
        version: '9.9.9',
        workdir: '/very/long/path/that/keeps/going/and/going/for/a/while/here',
        provider: 'Qwen',
      },
      60,
    ),
  )
  for (const line of out.split('\n')) {
    assert.ok(visLen(line) <= 60, `line too wide (${visLen(line)}): ${line}`)
  }
})

test('banner: одна строка на каждое поле (без hint)', () => {
  const out = stripAnsi(
    renderStartupBanner(
      { title: 'zames', version: '1', workdir: '/w', provider: 'Qwen' },
      80,
    ),
  )
  const lines = out.split('\n')
  assert.equal(lines.length, 5, 'top + 3 fields + bottom')
})
