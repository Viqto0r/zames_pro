import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { LogList, LogView } from '../src/tui/LogView.tsx'
import type { LogEntry } from '../src/tui/store.ts'

// test/tui-log-window*.test.ts pin the PURE row arithmetic. What the log rows
// actually look like was untested: a `raw` entry must print VERBATIM (it
// already carries its own ANSI), and an operator turn (`bar: true`) must draw
// the `▌` bar on EVERY visual row — the bug that survived because a single
// <Text> with a prefix child renders the prefix on the first line only.

const NL = String.fromCharCode(10)

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

function capture(el: React.ReactElement): string {
  const stdin = new FakeIn() as unknown as NodeJS.ReadStream
  const chunks: string[] = []
  const stdout = {
    columns: 80,
    rows: 24,
    write(s: string): boolean {
      chunks.push(s)
      return true
    },
  } as unknown as NodeJS.WriteStream
  const app = render(el, { stdin, stdout, debug: true })
  // Render synchronously enough for the final frame to be written.
  app.unmount()
  return chunks.join('')
}

const entry = (over: Partial<LogEntry>): LogEntry =>
  ({ id: 1, kind: 'system', text: '', ...over }) as LogEntry

test('a raw entry is printed verbatim, without a themed prefix', () => {
  const esc = String.fromCharCode(27)
  const out = capture(
    React.createElement(LogList, {
      entries: [entry({ raw: true, text: esc + '[31mRAW-LINE' + esc + '[0m' })],
    }),
  )
  assert.match(out, /RAW-LINE/)
  // Nothing was added in front of the pre-rendered text.
  assert.ok(!out.includes('❯ RAW-LINE'))
})

test('an operator turn draws the bar on EVERY row', () => {
  const out = capture(
    React.createElement(LogList, {
      entries: [
        entry({
          kind: 'user',
          bar: true,
          text: 'one' + NL + 'two' + NL + 'three',
        }),
      ],
    }),
  )
  const bars = out.split('▌').length - 1
  assert.ok(bars >= 3, 'expected a bar per row, got ' + bars + ': ' + out)
  // The rows keep their order and text.
  assert.ok(out.indexOf('one') < out.indexOf('two'))
  assert.ok(out.indexOf('two') < out.indexOf('three'))
})

test('a structured user row keeps its ❯ prefix, assistant/tool stay as-is', () => {
  const out = capture(
    React.createElement(LogList, {
      entries: [
        entry({ id: 1, kind: 'user', text: 'question' }),
        entry({ id: 2, kind: 'assistant', text: 'answer' }),
        entry({ id: 3, kind: 'tool', text: 'TOOLROW' }),
      ],
    }),
  )
  assert.match(out, /❯ question/)
  assert.match(out, /answer/)
  assert.match(out, /TOOLROW/)
})

test('LogView prints the INLINE log through <Static> as-is', () => {
  // LogView is the inline (scrollback) renderer: <Static> prints each item
  // once and never repaints it. Windowing is LogList's job (the full-screen
  // pane slices `entries` with log-window.ts BEFORE rendering), so every
  // entry handed to LogView must be printed.
  const entries = Array.from({ length: 3 }, (_, i) =>
    entry({ id: i + 1, kind: 'system', text: 'row-' + i }),
  )
  const out = capture(React.createElement(LogView, { entries }))
  for (const e of entries) assert.match(out, new RegExp(e.text))
})
