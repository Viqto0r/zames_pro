import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'
import { Transcript, TRANSCRIPT_LINE_CAP } from '../src/transcript.ts'

// Transcript is the JSONL event log. The cap and the name-sanitizing edge
// cases have their own files; this one pins the CORE lifecycle: the file name,
// the JSONL shape, the onLine mirror, the disabled mode and the backpressure
// health note.

// Every enabled Transcript is REGISTERED here and closed in afterEach: the
// createWriteStream opens asynchronously, so a stream still pending when the
// temp dir is removed reports ENOENT (noisy, and it hid which test leaked).
const opened: Transcript[] = []
afterEach(async () => {
  while (opened.length) await opened.pop()?.close()
})

function make(t: { after: (fn: () => unknown) => unknown }, over = {}) {
  const dir = makeTmpDirSync(t, 'tr-')
  const tr = new Transcript({ dir, sessionName: 'proj', ...over })
  opened.push(tr)
  return { dir, tr }
}

test('an enabled transcript creates a jsonl file named after the session', async (t) => {
  const { dir, tr } = make(t)
  assert.ok(tr.enabled)
  assert.ok(tr.file)
  assert.equal(path.dirname(tr.file as string), dir)
  assert.match(path.basename(tr.file as string), /^proj-.*\.jsonl$/)
  // Close the stream BEFORE the temp dir is removed, otherwise the pending
  // open reports ENOENT (the assertion still passes, but noisily).
  await tr.close()
})

test('log writes one JSON line with ts, elapsed and the type', async (t) => {
  const { tr } = make(t)
  tr.log('task', { n: 1 })
  await tr.close()
  const text = fs.readFileSync(tr.file as string, 'utf8')
  const lines = text.split(String.fromCharCode(10)).filter(Boolean)
  assert.equal(lines.length, 1)
  const obj = JSON.parse(lines[0])
  assert.equal(obj.type, 'task')
  assert.equal(obj.n, 1)
  assert.equal(typeof obj.ts, 'string')
  assert.equal(typeof obj.elapsed, 'number')
})

test('the onLine mirror runs even when the file is disabled', () => {
  const seen: string[] = []
  const tr = new Transcript({
    dir: 'unused',
    enabled: false,
    onLine: (l) => seen.push(l),
  })
  tr.log('x', { a: 1 })
  assert.equal(seen.length, 1)
  assert.equal(JSON.parse(seen[0]).type, 'x')
  assert.equal(tr.file, null)
})

test('a throwing onLine sink does not break the log call', () => {
  const tr = new Transcript({
    dir: 'unused',
    enabled: false,
    onLine: () => {
      throw new Error('boom')
    },
  })
  assert.doesNotThrow(() => tr.log('x'))
})

test('the session name is sanitized to one path segment', async (t) => {
  const dir = makeTmpDirSync(t, 'tr-name-')
  const tr = new Transcript({ dir, sessionName: 'a/b\\c:d' })
  opened.push(tr)
  assert.equal(path.dirname(tr.file as string), dir)
  assert.match(path.basename(tr.file as string), /^a_b_c_d-.*\.jsonl$/)
  await tr.close()
})

test('a long session name is capped at 120 characters', async (t) => {
  const dir = makeTmpDirSync(t, 'tr-long-')
  const tr = new Transcript({ dir, sessionName: 'x'.repeat(300) })
  opened.push(tr)
  const base = path.basename(tr.file as string)
  assert.ok(base.startsWith('x'.repeat(120) + '-'), base)
  await tr.close()
})

test('a line over the cap is replaced by a capped entry', async (t) => {
  const { tr } = make(t)
  tr.log('dump', { big: 'y'.repeat(TRANSCRIPT_LINE_CAP + 1000) })
  await tr.close()
  const text = fs.readFileSync(tr.file as string, 'utf8').trim()
  assert.ok(text.length <= TRANSCRIPT_LINE_CAP, 'line ' + text.length)
  const obj = JSON.parse(text)
  assert.equal(obj.type, 'dump')
})

test('healthNote is null without backpressure', (t) => {
  const { tr } = make(t)
  assert.equal(tr.healthNote(), null)
})

test('healthNote reports the number of backpressured writes', (t) => {
  const { tr } = make(t)
  tr.backpressure = 3
  assert.match(tr.healthNote() as string, /3 write/)
})

test('close is idempotent and a no-op without a stream', async () => {
  const off = new Transcript({ dir: 'unused', enabled: false })
  await off.close()
  await off.close()
})
