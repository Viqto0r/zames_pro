// A transcript line is capped at TRANSCRIPT_LINE_CAP by a RAW slice +
// ellipsis. The result is no longer valid JSON, so parseTranscript() drops
// that event entirely — /cost and /export silently lost the turn that
// produced a big tool result.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.js'
import { Transcript } from '../src/transcript.js'
import { parseTranscript } from '../src/commands.js'

test('a capped transcript line still parses as an event', async (t) => {
  const dir = await makeTmpDir(t, 'zames-trcap-')
  const tr = new Transcript({ dir, enabled: true, sessionName: 'proj' })
  tr.log('tool_result', { tool: 'Read', result: 'x'.repeat(200_000) })
  await new Promise((r) => setTimeout(r, 100))
  tr.stream?.end()
  const file = path.join(dir, fs.readdirSync(dir)[0])
  const body = fs.readFileSync(file, 'utf-8')
  const entries = parseTranscript(body)
  assert.equal(entries.length, 1, 'the capped event was dropped')
  assert.equal(entries[0].type, 'tool_result')
  assert.ok(String(entries[0].result).length > 0)
})
