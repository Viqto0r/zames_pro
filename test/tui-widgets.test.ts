import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { Checkbox, Select, HintBar } from '../src/tui/widgets.tsx'

// test/hintbar-width.test.ts only pins that HintBar MEASURES and CLIPS its row
// (by source regex). The actual output of the three widgets was never checked:
// a checkbox whose glyphs split into separate SGR runs, a select without its
// arrows, or a hint row that drops the WRONG chips are all invisible to a
// screenshot-free test suite.

const NL = String.fromCharCode(10)
const ESC = String.fromCharCode(27)

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

class FakeOut extends EventEmitter {
  columns = 80
  rows = 24
  data = ''
  write(s: string): boolean {
    this.data += s
    return true
  }
}

/**
 * Render one widget and return its text.
 *
 * Ink writes the frame several times (mount, re-render, settle) WITHOUT a
 * cursor-up between the writes, so the raw capture is the SAME text repeated.
 * The widget text itself never tiles, so the smallest period that repeats
 * across the whole (newline-trimmed, ANSI-stripped) string is one frame.
 */
async function capture(el: React.ReactElement): Promise<string> {
  const stdin = new FakeIn() as unknown as NodeJS.ReadStream
  const stdout = new FakeOut()
  const app = render(el, {
    stdin,
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
  })
  await new Promise((r) => setTimeout(r, 80))
  app.unmount()
  const text = stdout.data
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\n+$/, '')
  for (let p = 1; p <= text.length / 2; p++) {
    if (text.length % p !== 0) continue
    let ok = true
    for (let i = p; i < text.length; i += p) {
      if (text.slice(i, i + p) !== text.slice(0, p)) {
        ok = false
        break
      }
    }
    if (ok) return text.slice(0, p)
  }
  return text
}

test('Checkbox prints [x] when checked and [ ] when not', async () => {
  assert.equal(
    await capture(React.createElement(Checkbox, { checked: true })),
    '[x]',
  )
  assert.equal(
    await capture(React.createElement(Checkbox, { checked: false })),
    '[ ]',
  )
  // `focused` only changes the styling, never the glyphs.
  assert.equal(
    await capture(
      React.createElement(Checkbox, { checked: true, focused: true }),
    ),
    '[x]',
  )
})

test('Select wraps the value in single arrows', async () => {
  assert.equal(
    await capture(React.createElement(Select, { value: 'nord' })),
    '‹ nord ›',
  )
  assert.equal(
    await capture(React.createElement(Select, { value: '', focused: true })),
    '‹  ›',
  )
})

test('HintBar joins the chips with the middle-dot separator', async () => {
  const out = await capture(
    React.createElement(HintBar, {
      hints: [
        ['↑/↓', 'move'],
        ['Enter', 'ok'],
      ],
      maxCols: 80,
    }),
  )
  assert.equal(out, '↑/↓ move  ·  Enter ok')
  // Nothing was dropped: no trailing ellipsis.
  assert.ok(!out.includes('…'))
})

test('HintBar drops the TAIL when the row does not fit and marks it', async () => {
  const hints: Array<[string, string]> = [
    ['a', 'one'],
    ['b', 'two'],
    ['c', 'three'],
    ['d', 'four'],
    ['e', 'five'],
  ]
  const wide = await capture(
    React.createElement(HintBar, { hints, maxCols: 200 }),
  )
  assert.match(wide, /e five$/)
  const narrow = await capture(
    React.createElement(HintBar, { hints, maxCols: 20 }),
  )
  // The FIRST chips survive, the last ones go, and the row is marked.
  assert.match(narrow, /^a one/)
  assert.ok(!narrow.includes('e five'), narrow)
  assert.ok(narrow.includes('…'), narrow)
  assert.ok(narrow.length <= 20, narrow.length + ': ' + narrow)
})

test('HintBar keeps its first chip even when nothing fits', async () => {
  const out = await capture(
    React.createElement(HintBar, {
      hints: [['Esc', 'cancel this dialog now']],
      maxCols: 1,
    }),
  )
  assert.match(out, /Esc/)
})

// Keep the escape constant used above meaningful to a reader: the strips rely
// on it and must never see a raw ESC in the widget output.
test('the captured widgets carry no raw escape sequences', async () => {
  const out = await capture(React.createElement(Select, { value: 'x' }))
  assert.ok(!out.includes(ESC))
  assert.equal(out, '‹ x ›')
  assert.ok(!out.includes(NL))
})
