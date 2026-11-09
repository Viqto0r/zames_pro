import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { Transcript, TRANSCRIPT_LINE_CAP } from '../src/transcript.ts'
import { parseTranscript } from '../src/commands.ts'

// test/transcript-line-cap-json.test.ts pins that a capped line is still
// parseable. The DEGENERATE branch of the cap — an event whose KEYS alone blow
// the budget, so no per-string allowance can fit it — was unpinned: it must
// still write a VALID minimal event, otherwise /cost and /export lose the
// turn entirely.

const NL = String.fromCharCode(10)

async function logged(
  t: { after: (fn: () => unknown) => unknown },
  type: string,
  data: Record<string, unknown>,
): Promise<string[]> {
  const dir = await makeTmpDir(t, 'zames-trcap-')
  const mirror: string[] = []
  const tr = new Transcript({
    dir,
    enabled: true,
    sessionName: 'proj',
    onLine: (l) => mirror.push(l),
  })
  tr.log(type, data)
  await tr.close()
  const file = path.join(dir, fs.readdirSync(dir)[0])
  const body = fs.readFileSync(file, 'utf-8')
  return [body, mirror[0] ?? '']
}

test('an event whose KEYS alone exceed the cap becomes a valid minimal event', async (t) => {
  const data: Record<string, unknown> = {}
  // ~500 keys of 300 chars: no per-string allowance can make this fit.
  for (let i = 0; i < 500; i++) data['k' + i + '_' + 'z'.repeat(300)] = 1
  const [body] = await logged(t, 'huge', data)
  assert.ok(body.length < 1000, 'the degenerate event was not collapsed')
  const entries = parseTranscript(body)
  assert.equal(entries.length, 1, 'the collapsed event must stay parseable')
  assert.equal(entries[0].type, 'huge')
  assert.equal(entries[0].truncated, true)
})

test('a capped line and the onLine mirror agree and stay within the cap', async (t) => {
  const [body, mirror] = await logged(t, 'big', { s: 'y'.repeat(300_000) })
  const line = body.slice(0, body.indexOf(NL))
  assert.ok(line.length <= TRANSCRIPT_LINE_CAP, String(line.length))
  // The jsonl mirror carries the SAME capped line (one source of truth).
  assert.equal(mirror, line + NL)
  const [entry] = parseTranscript(body)
  assert.equal(entry.type, 'big')
  assert.ok(String(entry.s).length > 0)
})

test('a cut string never ends on a lone HIGH surrogate', async (t) => {
  // An odd prefix shifts the cut into the middle of an emoji pair.
  const s = 'a'.repeat(11) + String.fromCodePoint(0x1f600).repeat(60_000)
  const [body] = await logged(t, 'x', { s })
  const [entry] = parseTranscript(body)
  const kept = String(entry.s)
  assert.ok(kept.endsWith('\u2026'), 'the cap marker is missing')
  const last = kept.charCodeAt(kept.length - 2)
  assert.ok(
    !(last >= 0xd800 && last <= 0xdbff),
    'lone high surrogate: ' + last.toString(16),
  )
})

test('a SHORT event is written verbatim, without a truncation marker', async (t) => {
  const [body] = await logged(t, 'small', { v: 'ok' })
  const [entry] = parseTranscript(body)
  assert.equal(entry.v, 'ok')
  assert.equal(entry.truncated, undefined)
  assert.ok(!body.includes('\u2026'))
})
