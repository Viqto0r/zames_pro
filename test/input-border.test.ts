import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  setInputBorder,
  inputBorderStyle,
  inputBorderCols,
} from '../src/tui/ui-colors.ts'
import { inputInnerCols, inputBoxRows } from '../src/input/layout.ts'
import { CONFIG_SCHEMA, DEFAULTS } from '../src/config.ts'

// ui.inputBorder selects the frame of the input box. The frame is not only
// decoration: it consumes two columns and two rows, so the wrap width and the
// reserved height must follow it — a 'none' frame that still reserved the
// border columns would wrap the text early for no reason.

test('every accepted border style maps to an Ink value', () => {
  assert.equal(inputBorderStyle(), 'round')
  assert.equal(setInputBorder('single'), 'single')
  assert.equal(inputBorderStyle(), 'single')
  assert.equal(setInputBorder('double'), 'double')
  assert.equal(setInputBorder('bold'), 'bold')
  assert.equal(setInputBorder('none'), 'none')
  assert.equal(inputBorderStyle(), undefined, 'none draws no frame')
  assert.equal(inputBorderCols(), 0)
  assert.equal(setInputBorder('round'), 'round')
  assert.equal(inputBorderCols(), 2)
})

test('an unknown style falls back to round instead of hiding the frame', () => {
  assert.equal(setInputBorder('none'), 'none')
  assert.equal(setInputBorder('sparkles'), 'round')
  assert.equal(inputBorderStyle(), 'round')
  assert.equal(setInputBorder(undefined), 'round')
  setInputBorder('round')
})

test('a frameless box wraps wider and reserves fewer rows', () => {
  const cols = 40
  assert.equal(inputInnerCols(cols, 2), cols - 4)
  assert.equal(inputInnerCols(cols, 0), cols - 2)
  const buf = ''
  assert.equal(inputBoxRows('> ', buf, 0, cols, 2), 3)
  assert.equal(inputBoxRows('> ', buf, 0, cols, 0), 1)
})

test('ui.inputBorder is a /config setting with round as the default', () => {
  const field = CONFIG_SCHEMA.find((f) => f.path === 'ui.inputBorder')
  assert.ok(field, 'ui.inputBorder is not in CONFIG_SCHEMA')
  assert.equal(field.type, 'enum')
  assert.deepEqual(field.values, ['round', 'single', 'double', 'bold', 'none'])
  assert.equal(DEFAULTS.ui.inputBorder, 'round')
})
