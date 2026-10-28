import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, Box } from 'ink'
import { LogList } from '../src/tui/LogView.tsx'
import type { LogEntry } from '../src/tui/store.ts'

// An operator turn is marked by a `▌` bar on the LEFT of the message. It used to
// appear on the FIRST visual row only: Ink renders a multi-line string inside a
// single <Text> as-is, so a colored prefix child is not repeated. The operator
// reported exactly this (the bar vanished on wrapped lines). The rule now lives
// in LogRow: the (already wrapped) text is split into rows and every row gets
// its own bar.

function renderEntry(entry: LogEntry): Promise<string[]> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const { unmount } = render(
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(LogList, { entries: [entry] }),
      ),
      {
        patchConsole: false,
        stdout: {
          // Ink writes the frame here; `write` is called once per frame.
          write: (s: string) => {
            chunks.push(s)
            return true
          },
        } as unknown as NodeJS.WriteStream,
      },
    )
    setTimeout(() => {
      unmount()
      resolve(chunks)
    }, 120)
  })
}

test('the operator bar is drawn on EVERY row of a multi-line message', async () => {
  const chunks = await renderEntry({
    id: 1,
    kind: 'user',
    text: ['line one', 'line two', 'line three'].join(String.fromCharCode(10)),
    raw: false,
    bar: true,
  })
  const frame = chunks.join('')
  const bars = (frame.match(/▌/g) || []).length
  assert.equal(bars, 3, 'expected one bar per row, frame:\n' + frame)
})

test('a NON-bar entry keeps its own marker', async () => {
  const chunks = await renderEntry({
    id: 2,
    kind: 'user',
    text: 'single line',
    raw: false,
  })
  const frame = chunks.join('')
  assert.ok(frame.includes('❯'), 'the ❯ marker disappeared: ' + frame)
  assert.ok(!frame.includes('▌'), 'a bar leaked into a non-bar entry')
})
