import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// A path pasted/typed as the WHOLE input (some terminals do not send a
// bracketed paste) must become an [image#N]/[file#N] attachment on submit,
// not be sent as raw text.

test('submitting a single-token image path attaches it instead of sending', async () => {
  const e = new LineEditor()
  e._render = () => {}
  e.printAbove = () => {}
  const got: { text: string; n: number } = { text: '', n: 0 }
  e.onAttach = async (raw: string) => {
    assert.equal(raw, 'tmp/image.png')
    e.attachments.add({
      path: '/x/tmp/image.png',
      name: 'image.png',
      mime: 'image/png',
      size: 10,
    })
    return e.attachments.items[0]
  }
  e.onSubmit = (text, atts) => {
    got.text = text
    got.n = atts.length
  }
  e.buf = 'tmp/image.png'
  e.cursor = e.buf.length
  e._submit()
  // _attachOnSubmit is async — give it a tick.
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(got.text, '[image#1]')
  assert.equal(got.n, 1)
})

test('a normal sentence with a dot is NOT treated as a path', async () => {
  const e = new LineEditor()
  e._render = () => {}
  e.printAbove = () => {}
  let attached = false
  let submitted = ''
  e.onAttach = async () => {
    attached = true
    return null
  }
  e.onSubmit = (text) => {
    submitted = text
  }
  e.buf = 'check file.txt please'
  e.cursor = e.buf.length
  e._submit()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(attached, false, 'must not try to attach a sentence')
  assert.equal(submitted, 'check file.txt please')
})

test('a single-token non-path is sent as-is', async () => {
  const e = new LineEditor()
  e._render = () => {}
  e.printAbove = () => {}
  let submitted = ''
  e.onSubmit = (text) => {
    submitted = text
  }
  e.buf = 'hello'
  e.cursor = e.buf.length
  e._submit()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(submitted, 'hello')
})
