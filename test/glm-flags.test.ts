import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readGlmBodyFeatures,
  unsafeGlmModes,
  glmFlagsMismatch,
} from '../src/glm-flags.ts'

// The fixture is the REAL completion request captured from a signed-in z.ai
// session (only the ids were anonymized), so these tests pin the mode-flag
// contract to what the site actually sends.
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'glm',
)
const realBody = (): unknown =>
  JSON.parse(
    fs.readFileSync(path.join(dir, 'completions-request.json'), 'utf-8'),
  )

test('readGlmBodyFeatures reads the real request body', () => {
  const f = readGlmBodyFeatures(realBody())
  assert.equal(f.enableThinking, true)
  assert.equal(f.webSearch, false)
  assert.equal(f.autoWebSearch, false)
  assert.equal(f.previewMode, true)
  assert.equal(f.imageGeneration, false)
  assert.deepEqual(f.flags, ['general_agent'])
})

test('the real body is reported as UNSAFE (preview_mode + general_agent)', () => {
  // z.ai ships its own agent runtime by default; the provider must SEE that
  // and tell the operator, because it changes the answer format.
  const bad = unsafeGlmModes(readGlmBodyFeatures(realBody()))
  assert.deepEqual(bad.sort(), ['general_agent', 'preview_mode'])
})

test('a body with the runtime off is safe', () => {
  const safe = {
    features: {
      preview_mode: false,
      image_generation: false,
      enable_thinking: true,
      web_search: false,
      flags: [],
    },
  }
  assert.deepEqual(unsafeGlmModes(readGlmBodyFeatures(safe)), [])
})

test('glmFlagsMismatch reports thinking/search drift, not a match', () => {
  const f = readGlmBodyFeatures(realBody())
  assert.deepEqual(
    glmFlagsMismatch(f, { thinking: true, webSearch: false }),
    [],
  )
  assert.deepEqual(glmFlagsMismatch(f, { thinking: false, webSearch: false }), [
    'thinking',
  ])
  assert.deepEqual(glmFlagsMismatch(f, { thinking: true, webSearch: true }), [
    'web_search',
  ])
})

test('an auto web search counts as web search ON', () => {
  const f = readGlmBodyFeatures({ features: { auto_web_search: true } })
  assert.deepEqual(
    glmFlagsMismatch(f, { thinking: false, webSearch: true }),
    [],
  )
})

test('garbage never throws', () => {
  assert.deepEqual(readGlmBodyFeatures(null).flags, [])
  assert.deepEqual(readGlmBodyFeatures('x').flags, [])
  assert.deepEqual(readGlmBodyFeatures({ features: 42 }).flags, [])
  assert.deepEqual(unsafeGlmModes(readGlmBodyFeatures({})), [])
})
