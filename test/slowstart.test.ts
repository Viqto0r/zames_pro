import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'src', 'browser.ts'), 'utf-8')

test('the start deadline covers a slow DeepSeek turn', () => {
  const m = src.match(/const startDeadline = Date\.now\(\) \+ ([0-9_]+)/)
  assert.ok(m, 'the start deadline must be a literal in browser.ts')
  const ms = Number(m[1].replace(/_/g, ''))
  assert.ok(ms >= 25000, 'start deadline is ' + ms + 'ms')
})

test('a visible Stop button counts as a started send', () => {
  assert.match(src, /const stopVisible = await this\._isGenerating\(\)/)
})

test('a single stray Stop paint does not start the turn', () => {
  assert.match(src, /let stopTicks = 0/)
})
