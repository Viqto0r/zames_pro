// renderDoctor() prints one `[OK]/[WARN]` row per check. Several values come
// from the ENVIRONMENT or from operator input — the working directory, a model
// id, a browser channel, an error message — and were printed VERBATIM: a
// newline in one of them starts a new terminal line, so the value can fake an
// extra doctor row (`[OK] auth saved`). One row must stay on one line.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDoctor } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const NL = String.fromCharCode(10)

test('a value with a newline cannot fake a doctor row', () => {
  const d = {
    nodeVersion: 'v24',
    platform: 'linux',
    workdir: '/w' + NL + '[OK]  auth             saved',
    gitOk: true,
    gitBranch: 'main',
    configOk: true,
    browserChannel: null,
    authSaved: false,
    clipboardTool: 'xclip',
    mcpServers: 0,
    mcpTools: 0,
    transcriptOk: true,
    provider: 'glm',
    providerModel: 'glm-4' + NL + '[OK]  auth             saved',
  }
  const out = renderDoctor(d as never, translate('en'))
  // No LINE may start with a doctor marker and read as an auth row of its own.
  const authRows = out
    .split(NL)
    .filter((l) => /^\s*\[(OK|WARN)\]\s+auth\b/.test(l))
  assert.equal(authRows.length, 1, JSON.stringify(out))
  assert.ok(authRows[0].includes('[WARN]'), authRows[0])
})
