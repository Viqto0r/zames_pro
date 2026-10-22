import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configGetValue } from '../src/config-commands.ts'

// A password stored as `""` (the operator CLEARED it with
// `/config set browser.auth.password ""`) must read as empty, not as a set
// secret. The mask triggers on `String(value).length > 0`, so an empty string
// shows `""` — correct — but a value that is the literal two characters `""`
// (a JSON string containing quotes) … is not the case here. What IS wrong: a
// password of only WHITESPACE is length > 0 and gets masked, hiding the fact
// that it cannot log in.
test('a whitespace-only password is shown as its real (empty-looking) value', () => {
  const t = ((k: string) => k) as never
  assert.equal(configGetValue('browser.auth.password', '   ', t), '"   "')
})

test('a real password is masked', () => {
  const t = ((k: string) => k) as never
  assert.equal(
    configGetValue('browser.auth.password', 'hunter2', t),
    '********',
  )
})
