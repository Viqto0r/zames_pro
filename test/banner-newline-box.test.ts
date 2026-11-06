import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderStartupBanner } from '../src/banner.ts'

// The banner is a BOX: every row must be exactly `│ … │` of the same width.
// The working directory and the provider label are printed inside it, and a
// NEWLINE in one of them broke the box apart — the tail became a bare line
// with no borders and the following rows were one column short.
const NL = String.fromCharCode(10)

function rows(out: string): string[] {
  return out.split(NL)
}

test('a newline in the workdir cannot break the banner box', () => {
  const out = renderStartupBanner(
    {
      title: 'zames',
      version: '1.0.0',
      workdir: '/w' + NL + 'FAKE',
      provider: 'deepseek',
    },
    60,
  )
  const lines = rows(out)
  for (const l of lines) {
    assert.ok(
      !/^FAKE/.test(l),
      'a bare FAKE row leaked: ' + JSON.stringify(out),
    )
  }
  // Every INNER row starts and ends with the box border.
  const inner = lines.filter(
    (l) => l.includes('cwd:') || l.includes('provider:'),
  )
  for (const l of inner) {
    assert.ok(
      l.startsWith('│') && l.endsWith('│'),
      'row broken: ' + JSON.stringify(l),
    )
  }
})

test('a newline in the provider label cannot break the banner box', () => {
  const out = renderStartupBanner(
    {
      title: 'zames',
      version: '1.0.0',
      workdir: '/w',
      provider: 'Q' + NL + 'FAKE',
    },
    60,
  )
  assert.ok(
    !rows(out).some((l) => /^FAKE/.test(l)),
    'a bare FAKE row leaked: ' + JSON.stringify(out),
  )
})
