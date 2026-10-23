import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sendLogPath } from '../src/send-telemetry.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

// The provider id comes from the CONFIG (`/provider`, a hand-edited
// config.json) and is used as a FILE NAME: `sends-<provider>.jsonl`. It was not
// sanitized, so a value with a separator or `..` escaped the log directory —
// `../x` wrote `sends-../x.jsonl` (a SUBDIRECTORY), and an absolute-looking
// value produced a path outside `~/.zames/logs`. A malformed config then makes
// the telemetry (and its rotation, which deletes files) touch paths the
// operator never intended.
test('a provider id never escapes the log directory', (t) => {
  const dir = makeTmpDirSync(t, 'zames-tel-')
  for (const provider of ['../evil', '/etc/passwd', 'a/b', '..']) {
    const p = sendLogPath(dir, provider)
    const rel = path.relative(dir, p)
    assert.equal(
      rel.startsWith('..') || path.isAbsolute(rel),
      false,
      `${provider} escaped to ${p}`,
    )
    assert.equal(
      p.split(path.sep).length,
      path.join(dir, 'x').split(path.sep).length,
      `${provider} created a subdirectory: ${p}`,
    )
  }
  // A normal provider id is unchanged.
  assert.equal(sendLogPath(dir, 'glm'), path.join(dir, 'sends-glm.jsonl'))
  void fs
})
