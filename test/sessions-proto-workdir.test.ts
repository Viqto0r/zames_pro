import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveSession, loadLastSession } from '../src/sessions.ts'

// `byWorkdir` is a plain object keyed by the WORKDIR PATH. A POSIX directory
// may legally be named `__proto__`; assigning that key sets the object's
// PROTOTYPE instead of an own entry, so the index never records the session
// (the JSON on disk has no key at all) — the next launch from that project
// restores the global last chat of ANOTHER project.

const INDEX = path.join(os.homedir(), '.zames', '.sessions', 'last.json')

test('a workdir named __proto__ is an own key of the index', () => {
  saveSession({ id: 'chat-proto', title: 't', workdir: '__proto__' })
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf-8'))
  assert.equal(
    Object.prototype.hasOwnProperty.call(raw.byWorkdir, '__proto__'),
    true,
    JSON.stringify(raw.byWorkdir),
  )
  assert.equal(raw.byWorkdir['__proto__'], 'chat-proto')
  assert.equal(loadLastSession('__proto__')?.id, 'chat-proto')
})
