import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { charWidth } from '../src/input/layout.ts'

// The Ink config menu estimates how many ROWS a field takes so its window fits
// the terminal. It had its OWN width rule (`cp >= 0x1100 ? 2 : 1`), which
// counted box arrows (`→`), the hourglass `⧗` and `─` as TWO columns and a
// combining mark / VS16 as ONE — the shared `charWidth` says 1, 1, 1 and 0.
// Over-counting reserved phantom rows on a narrow terminal: the menu showed
// fewer entries than fit and the pane looked half empty.
//
// The guard pins the SOURCE: the menu must delegate to `charWidth`, not carry
// a second width table.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the config menu uses the shared charWidth rule', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'ConfigMenu.tsx'),
    'utf-8',
  )
  assert.match(src, /charWidth\(/, 'ConfigMenu does not use charWidth')
  assert.doesNotMatch(
    src,
    /for \(const ch of str\) w \+= ch\.codePointAt\(0\) >= 0x1100 \? 2 : 1/,
    'the local width table is still there',
  )
  assert.doesNotMatch(
    src,
    /label\.length \+ 12/,
    'itemRows still counts UTF-16 units instead of columns',
  )
})

test('the shared rule is what the probe characters need', () => {
  assert.equal(charWidth(0x2192), 1)
  assert.equal(charWidth(0x29d7), 1)
  assert.equal(charWidth(0x0301), 0)
  assert.equal(charWidth(0xfe0f), 0)
  assert.equal(charWidth(0x1f600), 2)
})
