import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skillBody } from '../src/context.ts'

const NL = String.fromCharCode(10)

// `skillBody()` strips the YAML frontmatter and returns the instruction body.
// A SKILL.md with the BOM at the start (Windows editors and some generators
// write one) does NOT start with `---` after String(), so the frontmatter was
// kept and the model received the raw YAML (name/description/allowed-tools)
// mixed into the instructions.
test('skillBody strips frontmatter when the file starts with a BOM', () => {
  const raw =
    String.fromCharCode(0xfeff) +
    ['---', 'name: demo', 'description: d', '---', 'BODY LINE'].join(NL)
  assert.equal(skillBody(raw), 'BODY LINE')
})

// A frontmatter block with CRLF line endings must also be stripped (the code
// normalizes CRLF, so this is a guard against a regression of that).
test('skillBody strips CRLF frontmatter', () => {
  // Proper CRLF: every line ENDS with CRLF (the old join put the CR after
  // the newline, which is a different byte sequence).
  const raw = ['---', 'name: demo', '---', 'BODY'].join(
    String.fromCharCode(13) + NL,
  )
  assert.equal(skillBody(raw), 'BODY')
})

// No frontmatter at all: the whole trimmed file is the body.
test('skillBody keeps a file without frontmatter', () => {
  assert.equal(skillBody('  plain body  '), 'plain body')
})
