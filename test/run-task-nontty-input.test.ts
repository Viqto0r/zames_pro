import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The NON-TTY input watcher inside runTask() cannot be driven from a test
// without a real process stdin (reading it ends the whole runner) and the
// `ui` option is not a seam for it, so its CONTRACT is pinned against the
// source instead: which keys are handled, what Enter does, and that a
// multi-line paste is collapsed and expanded again on queue. A refactor that
// drops one of these branches (or turns Enter into "send empty") fails here.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src', 'run-task.ts'), 'utf-8')

const slice = (from: string, to: string): string => {
  const a = src.indexOf(from)
  assert.ok(a >= 0, 'missing: ' + from)
  const b = src.indexOf(to, a)
  assert.ok(b > a, 'missing: ' + to)
  return src.slice(a, b)
}

const watcher = slice('function watchInput(', 'export interface TaskResult')

test('the watcher is only installed for a raw TTY stdin', () => {
  assert.match(
    watcher,
    /if \(!stdin\.isTTY \|\| !stdin\.setRawMode\) return \(\) => \{\}/,
  )
  assert.match(watcher, /stdin\.setRawMode\(true\)/)
  assert.match(watcher, /setRawMode\(wasRaw \|\| false\)/)
})

test('bracketed paste mode is turned on and restored', () => {
  assert.match(watcher, /\[\?2004h/)
  assert.match(watcher, /\[\?2004l/)
})

test('Enter expands the pastes and queues only non-empty text', () => {
  const enter = slice(
    'const text = expandPastes(pastes, buf)',
    'if (code === 3)',
  )
  assert.match(enter, /expandPastes\(pastes, buf\)\.trim\(\)/)
  assert.match(enter, /if \(text && onQueue\) onQueue\(text\)/)
  assert.match(enter, /buf = ''/)
  assert.match(enter, /pastes\.length = 0/)
})

test('Esc and Ctrl+C abort the generation', () => {
  assert.match(watcher, /if \(!inPaste && s === ESC\) \{/)
  assert.match(watcher, /onEscape\(\)/)
  const ctrlC = slice('if (code === 3)', 'if (code === 21)')
  assert.match(ctrlC, /onEscape\(\)/)
})

test('Ctrl+U clears the line together with its pastes', () => {
  const u = slice('if (code === 21)', 'if (code === 127')
  assert.match(u, /buf = ''/)
  assert.match(u, /pastes\.length = 0/)
})

test('Backspace removes one character and an empty line is a no-op', () => {
  const bs = slice('if (code === 127 || code === 8)', 'if (ch === ESC)')
  assert.match(bs, /if \(buf\)/)
  assert.match(bs, /buf = buf\.slice\(0, -1\)/)
})

test('escape sequences are consumed, other control codes ignored', () => {
  assert.match(watcher, /const m = s\.match\(CSI_RE\)/)
  assert.match(watcher, /if \(code < 32\) continue/)
})

test('a multi-line paste becomes a marker and short text is flattened', () => {
  assert.match(watcher, /const rep = pasteReplacement\(raw\)/)
  assert.match(watcher, /pastes\.push\(rep\)/)
  assert.match(watcher, /buf \+= rep\.marker/)
  const insert = slice('const insert = (text: string) =>', 'const insertPaste')
  assert.match(insert, /\.split\(LF\)/)
  assert.match(insert, /\.join\(' '\)/)
})

test('the cleanup detaches the listener and restores raw mode', () => {
  assert.match(watcher, /stdin\.removeListener\('data', handler\)/)
  assert.match(watcher, /setRawMode\(wasRaw \|\| false\)/)
})
