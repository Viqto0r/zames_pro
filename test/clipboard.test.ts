import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readClipboardImageDetailed } from '../src/attachments.ts'

// We cannot test the real clipboard in CI, but we can assert the function is
// safe: it never throws and always returns a { data, via } object, whatever
// the platform / available tools are.
test('readClipboardImageDetailed не бросает и возвращает форму {data, via}', () => {
 const res = readClipboardImageDetailed()
 assert.ok(res && typeof res === 'object')
 assert.ok('data' in res)
 assert.ok(typeof res.via === 'string' && res.via.length > 0)
 assert.ok(res.data === null || Buffer.isBuffer(res.data))
})
