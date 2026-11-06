import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideRelease } from '../src/release-policy.ts'

// The BREAKING note is shown to the OPERATOR when the loop refuses to release.
// It was built as `scope + ': ' + description` and then wrapped in ANOTHER
// pair of parentheses, so a scoped breaking commit produced
// `... (cli): drop the old flag)` — a stray closing paren and a broken
// sentence in the report.

test('a scoped breaking commit reads as one clean sentence', () => {
  const d = decideRelease(['fix(cli)!: drop the old flag'])
  assert.equal(d.bump, 'major')
  const note = d.blocked || ''
  assert.ok(note.includes('cli'), note)
  assert.ok(note.includes('drop the old flag'), note)
  assert.equal(note.split('(').length - 1, 1, 'extra open paren: ' + note)
  assert.equal(note.split(')').length - 1, 1, 'extra close paren: ' + note)
})

test('an unscoped breaking commit is unchanged', () => {
  const d = decideRelease(['fix!: drop the old flag'])
  const note = d.blocked || ''
  assert.ok(note.includes('(drop the old flag)'), note)
})
