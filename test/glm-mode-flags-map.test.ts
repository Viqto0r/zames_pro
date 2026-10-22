import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readGlmBodyFeatures, unsafeGlmModes } from '../src/glm-flags.ts'

// `features.flags` is read as an ARRAY (the live fixture sends one). Other
// builds send the flags as an OBJECT MAP (`{"general_agent": true}`), which is
// the natural shape when a flag has a value. A map was silently read as "no
// flags", so z.ai's OWN agent runtime was reported as OFF and the operator
// never learned that the answer format could be broken.
test('readGlmBodyFeatures: flags given as an object map are read', () => {
  const f = readGlmBodyFeatures({
    features: { preview_mode: false, flags: { general_agent: true } },
  })
  assert.deepEqual(f.flags, ['general_agent'])
  assert.deepEqual(unsafeGlmModes(f), ['general_agent'])
})

test('readGlmBodyFeatures: a false flag in a map is not reported', () => {
  const f = readGlmBodyFeatures({
    features: { flags: { general_agent: false, other: true } },
  })
  assert.deepEqual(f.flags, ['other'])
  assert.deepEqual(unsafeGlmModes(f), [])
})

test('readGlmBodyFeatures: an array of flags still works', () => {
  const f = readGlmBodyFeatures({ features: { flags: ['general_agent'] } })
  assert.deepEqual(f.flags, ['general_agent'])
})
