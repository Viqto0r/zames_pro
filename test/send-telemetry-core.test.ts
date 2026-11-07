import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'
import {
  formatSendEvent,
  parseSendEvents,
  summarizeSends,
  sendLogPath,
  appendSendEvent,
  readSendEvents,
  rotateSendLogs,
  type SendEvent,
} from '../src/send-telemetry.ts'

// The telemetry file feeds /limits and the adaptive throttle. The blockMs edge
// cases have their own four files; this one pins the CORE: the JSONL round
// trip, the windowed counters, the provider-id sanitizing and the rotation.

function ev(over: Partial<SendEvent> = {}): SendEvent {
  return {
    at: new Date().toISOString(),
    provider: 'deepseek',
    intervalMs: 15000,
    waitedMs: 15000,
    outcome: 'ok',
    ...over,
  }
}

test('formatSendEvent writes ONE valid JSON line and round-trips', () => {
  const e = ev({ outcome: 'rate_limit', errorText: 'slow down' })
  const line = formatSendEvent(e)
  assert.equal(line.includes(String.fromCharCode(10)), false)
  assert.deepEqual(JSON.parse(line), e)
})

test('parseSendEvents skips blank lines, junk and broken JSON', () => {
  const a = ev()
  const b = ev({ outcome: 'busy' })
  const raw = [
    JSON.stringify(a),
    '',
    '   ',
    'not json',
    '{"outcome":',
    JSON.stringify(b),
  ].join(String.fromCharCode(10))
  const out = parseSendEvents(raw)
  assert.equal(out.length, 2)
  assert.equal(out[1].outcome, 'busy')
})

test('parseSendEvents drops an object without a string outcome', () => {
  const raw = ['{"at":"x"}', '{"outcome":1}', '{"outcome":"ok"}'].join(
    String.fromCharCode(10),
  )
  assert.equal(parseSendEvents(raw).length, 1)
})

test('parseSendEvents tolerates empty input', () => {
  assert.deepEqual(parseSendEvents(''), [])
  assert.deepEqual(parseSendEvents(undefined as unknown as string), [])
})

test('summarizeSends counts the windows and the rate limits', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  const at = (min: number): string => new Date(now - min * 60_000).toISOString()
  const events = [
    ev({ at: at(1) }),
    ev({ at: at(5), outcome: 'rate_limit' }),
    ev({ at: at(20) }),
    ev({ at: at(40), outcome: 'rate_limit' }),
    ev({ at: at(90) }),
  ]
  const s = summarizeSends(events, now)
  assert.equal(s.last10m, 2)
  assert.equal(s.last30m, 3)
  assert.equal(s.last60m, 4)
  assert.equal(s.rateLimits, 2)
})

test('a FUTURE timestamp is in no window', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  const events = [ev({ at: new Date(now + 60_000).toISOString() })]
  const s = summarizeSends(events, now)
  assert.equal(s.last10m, 0)
  assert.equal(s.last30m, 0)
  assert.equal(s.last60m, 0)
})

test('an unparsable timestamp is counted nowhere', () => {
  const s = summarizeSends([ev({ at: 'yesterday' })], Date.now())
  assert.equal(s.last60m, 0)
})

test('the average block is 0 without any block', () => {
  assert.equal(summarizeSends([ev()], Date.now()).avgBlockMs, 0)
  assert.equal(summarizeSends([], Date.now()).avgBlockMs, 0)
})

test('sendLogPath sanitizes the provider id and cannot escape the dir', () => {
  const dir = path.join('logs')
  assert.equal(
    sendLogPath(dir, 'deepseek'),
    path.join(dir, 'sends-deepseek.jsonl'),
  )
  const evil = sendLogPath(dir, '../../etc/passwd')
  assert.equal(path.dirname(evil), dir)
  assert.equal(path.basename(evil), 'sends-.._.._etc_passwd.jsonl')
  assert.equal(sendLogPath(dir, ''), path.join(dir, 'sends-unknown.jsonl'))
})

test('append + read round-trip through a real file', (t) => {
  const dir = makeTmpDirSync(t, 'tele-')
  appendSendEvent(dir, ev({ outcome: 'ok' }))
  appendSendEvent(dir, ev({ outcome: 'busy' }))
  const out = readSendEvents(dir, 'deepseek')
  assert.equal(out.length, 2)
  assert.equal(out[1].outcome, 'busy')
  // A different provider is a different file.
  assert.deepEqual(readSendEvents(dir, 'qwen'), [])
})

test('readSendEvents returns [] for a missing directory', (t) => {
  const dir = path.join(makeTmpDirSync(t, 'tele-missing-'), 'nope')
  assert.deepEqual(readSendEvents(dir, 'deepseek'), [])
})

test('rotateSendLogs keeps the newest `keep` files', (t) => {
  const dir = makeTmpDirSync(t, 'tele-rot-')
  for (let i = 0; i < 7; i++) {
    const f = path.join(dir, 'sends-p' + i + '.jsonl')
    fs.writeFileSync(f, '{}\n')
    const when = new Date(Date.now() - (7 - i) * 60_000)
    fs.utimesSync(f, when, when)
  }
  rotateSendLogs(dir, 3)
  const left = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
  assert.deepEqual(left, ['sends-p4.jsonl', 'sends-p5.jsonl', 'sends-p6.jsonl'])
})

test('rotateSendLogs ignores other files and a missing dir', (t) => {
  const dir = makeTmpDirSync(t, 'tele-rot2-')
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
  fs.writeFileSync(path.join(dir, 'sends-a.jsonl'), '{}\n')
  rotateSendLogs(dir, 1)
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')))
  assert.ok(fs.existsSync(path.join(dir, 'sends-a.jsonl')))
  rotateSendLogs(path.join(dir, 'missing'), 1)
})
