import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skillBody } from '../src/context.ts'

// skillBody's happy paths (BOM, CRLF, a plain body) live in
// skill-body-bom.test.ts. These cases pin the DELIMITER edges that decide
// whether the model gets the raw YAML or the instructions: a lone `---`, an
// unterminated frontmatter, a closing delimiter at EOF without a trailing
// newline, an EMPTY frontmatter block, and a longer run of dashes.

const NL = String.fromCharCode(10)

test('an empty file is an empty body', () => {
  assert.equal(skillBody(''), '')
})

test('a lone --- is not frontmatter and is kept', () => {
  assert.equal(skillBody('---'), '---')
})

test('an unterminated frontmatter is kept as the body', () => {
  const raw = '---' + NL + 'name: x'
  assert.equal(skillBody(raw), raw)
})

test('a closing --- at EOF without a newline yields an empty body', () => {
  assert.equal(skillBody('---' + NL + 'name: x' + NL + '---'), '')
  assert.equal(skillBody('---' + NL + 'name: x' + NL + '---' + NL), '')
})

test('a longer dash run is still a closing delimiter', () => {
  assert.equal(skillBody('---' + NL + 'name: x' + NL + '----'), '')
  assert.equal(
    skillBody('----' + NL + 'name: x' + NL + '---' + NL + 'body'),
    'body',
  )
})

test('an empty frontmatter block keeps the body', () => {
  assert.equal(skillBody('---' + NL + '---' + NL + 'body'), 'body')
})

test('a line starting with ---x is not a delimiter', () => {
  const raw = '---x' + NL + 'body'
  assert.equal(skillBody(raw), raw)
})

test('the body is trimmed of surrounding whitespace', () => {
  assert.equal(
    skillBody('---' + NL + 'a: 1' + NL + '---' + NL + '  b  ' + NL),
    'b',
  )
})
