// /cost and /export aggregate tool names into per-tool maps. A tool NAME is
// arbitrary text (an MCP server can advertise anything, and the model may emit
// any name), so `counts[name] = ...` with name = '__proto__' silently ASSIGNS
// THE PROTOTYPE instead of adding an entry: the tool disappears from the
// count AND the Object.prototype of the running process is mutated.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { summarizeTranscript } from '../src/commands.ts'
import { Transcript } from '../src/transcript.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

const own = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k)

test('summarizeTranscript counts a tool named __proto__ as its own entry', () => {
  const stats = summarizeTranscript([
    { type: 'tool_call', tool: '__proto__' },
    { type: 'tool_call', tool: '__proto__' },
    { type: 'tool_call', tool: 'Bash' },
  ])
  assert.equal(own(stats.toolCounts, '__proto__'), true)
  assert.equal(stats.toolCounts['__proto__'], 2)
  assert.equal(stats.toolCounts['Bash'], 1)
})

test('a __proto__ tool name does not crash on JSON serialization', () => {
  // A plain {} with `counts['__proto__'] = n` ended up with a NUMBER as its
  // prototype: /export JSON.stringify()s the stats and every entry threw
  // "Cannot convert object to primitive value" (string conversion of the
  // proto-less object).
  const stats = summarizeTranscript([
    { type: 'tool_call', tool: '__proto__' },
    { type: 'tool_call', tool: 'Bash' },
  ])
  const round = JSON.parse(JSON.stringify(stats.toolCounts)) as Record<
    string,
    number
  >
  assert.equal(round['Bash'], 1)
  assert.equal(own(round, '__proto__'), true)
  assert.equal(round['__proto__'], 1)
})

test('summarizeTranscript tracks tool TIME under a __proto__ name', () => {
  const stats = summarizeTranscript([
    { type: 'tool_result', tool: '__proto__', durationMs: 5 },
  ])
  assert.equal(own(stats.toolTime, '__proto__'), true)
  assert.equal(stats.toolTime['__proto__'], 5)
})

// A name colliding with an Object.prototype METHOD used to read the function
// as a number: `undefined + 1` -> NaN, and the rendered line became
// "constructor: function Object() { [native code] }1".
test('a tool named constructor gets a numeric count', () => {
  const stats = summarizeTranscript([
    { type: 'tool_call', tool: 'constructor' },
    { type: 'tool_call', tool: 'toString' },
  ])
  assert.equal(stats.toolCounts['constructor'], 1)
  assert.equal(stats.toolCounts['toString'], 1)
})

// `sessionName` is the working-directory LABEL (`a/b`, `C:\\proj`), and it
// went into the file name as-is: `path.join` then nested a subdirectory that
// does not exist and the stream failed with ENOENT — the run had NO
// transcript at all.
test('a session name with a path separator does not break the transcript file', async (t) => {
  const dir = makeTmpDirSync(t, 'zames-trname-')
  const tr = new Transcript({ dir, enabled: true, sessionName: 'a/b:c' })
  tr.log('x')
  await tr.close()
  assert.ok(tr.file, 'a file path must be set')
  assert.equal(path.dirname(tr.file as string), dir)
  assert.ok(fs.existsSync(tr.file as string), 'the transcript file must exist')
  assert.ok(
    (fs.readFileSync(tr.file as string, 'utf-8') || '').includes('"type":"x"'),
  )
})
