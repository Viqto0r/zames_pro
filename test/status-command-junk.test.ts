import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatus, doctorProbeSummary } from '../src/status-command.ts'

// `/status` and the `/doctor` probe rows print values that come from the
// ENVIRONMENT (a git branch, a working directory) and from the config. A
// newline in one of them started a row of its own, and a broken numeric value
// (NaN from a hand-edited config) rendered as the bare word `null` / `NaN`
// instead of a real number — the same `oneLine` rule the doctor table already
// applies to its own values.
const t = (k: string, p?: Record<string, string | number>) =>
  k + (p ? JSON.stringify(p) : '')

const base = {
  workdir: '/w',
  reviewMode: null,
  chatId: null,
  freshNext: false,
  promptNext: false,
  lastChat: null,
  sessionsDir: '/s',
  devMode: false,
  maxIterations: 0,
  headless: true,
  debug: false,
  deepThinking: false,
  webSearch: false,
  undo: false,
  checkpoint: false,
  transcriptFile: null,
  goal: null,
  localeName: 'English',
  mcpToolCount: null,
  tokenUsage: null,
}

test('a newline in a status value cannot fake a row', () => {
  const lines = formatStatus(
    {
      ...base,
      workdir: '/w\nFAKE',
      localeName: 'en\nFAKE',
      sessionsDir: '/s\nFAKE',
    } as never,
    t,
  )
  for (const line of lines) {
    assert.ok(!line.includes('\n'), 'a status row carries a newline: ' + line)
    assert.ok(!/^FAKE$/m.test(line), line)
  }
})

test('a broken numeric value is not printed as null/NaN', () => {
  const lines = formatStatus({ ...base, maxIterations: Number.NaN } as never, t)
  assert.ok(
    !lines.some((l) => /"v":null|"v":"NaN"/.test(l)),
    JSON.stringify(lines),
  )
})

test('the doctor probe row flattens a branch name and a bad count', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'ma\nin',
    mcpServers: Number.NaN,
    mcpTools: -3,
    authSaved: true,
  })
  for (const r of rows) {
    assert.ok(!r.label.includes('\n'), r.label)
    assert.ok(!/NaN|-3/.test(r.label), r.label)
  }
})
