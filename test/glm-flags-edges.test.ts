import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readGlmBodyFeatures,
  unsafeGlmModes,
  glmFlagsMismatch,
} from '../src/glm-flags.ts'

// readGlmBodyFeatures decides whether z.ai's OWN agent runtime is still ON in
// a completion request. If it reads a flag map as "no flags", the runtime is
// reported safe while z.ai keeps running the tools in ITS sandbox and zames'
// tools never execute — a silent, total failure. The live fixture is covered
// in glm-flags.test.ts; the EDGE shapes are pinned here.

test('an object flag map: only TRUE values are ON', () => {
  const f = readGlmBodyFeatures({
    features: {
      flags: { general_agent: true, other: false, str: 'x', off: 'false' },
    },
  })
  assert.deepEqual(f.flags.sort(), ['general_agent', 'str'])
})

test('an array flag map keeps only the string entries', () => {
  const f = readGlmBodyFeatures({
    features: { flags: ['a', 1, null, 'b'] },
  })
  assert.deepEqual(f.flags, ['a', 'b'])
})

test('a non-boolean field is IGNORED, not coerced', () => {
  const f = readGlmBodyFeatures({
    features: { enable_thinking: 'true', web_search: 1, preview_mode: null },
  })
  assert.equal(f.enableThinking, undefined)
  assert.equal(f.webSearch, undefined)
  assert.equal(f.previewMode, undefined)
})

test('a missing features block yields no flags and no modes', () => {
  for (const body of [{}, { features: null }, { features: [] }]) {
    const f = readGlmBodyFeatures(body)
    assert.deepEqual(f.flags, [])
    assert.deepEqual(unsafeGlmModes(f), [])
  }
})

test('every unsafe mode is reported with its own name', () => {
  const f = readGlmBodyFeatures({
    features: {
      preview_mode: true,
      image_generation: true,
      flags: ['general_agent'],
    },
  })
  assert.deepEqual(unsafeGlmModes(f), [
    'preview_mode',
    'image_generation',
    'general_agent',
  ])
})

test('a mismatch is NOT reported when the body carries no thinking field', () => {
  const f = readGlmBodyFeatures({ features: {} })
  assert.deepEqual(
    glmFlagsMismatch(f, { thinking: true, webSearch: false }),
    [],
  )
})

test('web search drift is reported in both directions', () => {
  const on = readGlmBodyFeatures({ features: { web_search: true } })
  const off = readGlmBodyFeatures({ features: { web_search: false } })
  assert.deepEqual(
    glmFlagsMismatch(on, { thinking: false, webSearch: false }),
    ['web_search'],
  )
  assert.deepEqual(
    glmFlagsMismatch(off, { thinking: false, webSearch: true }),
    ['web_search'],
  )
})

test('a thinking field present as false is a real mismatch against true', () => {
  const f = readGlmBodyFeatures({ features: { enable_thinking: false } })
  assert.deepEqual(glmFlagsMismatch(f, { thinking: true, webSearch: false }), [
    'thinking',
  ])
})
