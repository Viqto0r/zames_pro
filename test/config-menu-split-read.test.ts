import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runConfigMenu } from '../src/config-menu.ts'
import { CONFIG_SCHEMA, CONFIG_TOP_GROUPS } from '../src/config.ts'
import { translate } from '../src/i18n.ts'

// The legacy /config menu edits a STRING value in place. A terminal hands a
// UTF-8 stream over in whatever byte chunks the pty chose, so an emoji or a
// Cyrillic letter can be SPLIT between two `data` events. The menu decoded
// every chunk on its own (`buf.toString('utf-8')`), so both halves became
// U+FFFD and the saved value was corrupted — the same bug promptOnce already
// fixed with a StringDecoder (test/prompt-once-surrogate.test.ts).

class FakeIn extends EventEmitter {
  isTTY = true
  isRaw = false
  setRawMode(v: boolean): this {
    this.isRaw = v
    return this
  }
  resume(): this {
    return this
  }
}

class FakeOut {
  data = ''
  columns = 80
  rows = 24
  write(s: string): boolean {
    this.data += s
    return true
  }
}

const DOWN = '\x1b[B'
const ENTER = '\r'

function groupsPresent(): string[] {
  return [...CONFIG_TOP_GROUPS].filter((g) =>
    CONFIG_SCHEMA.some((f) => f.topKey === g && !f.advanced),
  )
}

function pathIndex(path: string): { groupIdx: number; fieldIdx: number } {
  const f = CONFIG_SCHEMA.find((x) => x.path === path)
  assert.ok(f, 'no schema entry for ' + path)
  const groupIdx = groupsPresent().indexOf(f!.topKey)
  const fieldIdx = CONFIG_SCHEMA.filter(
    (x) => x.topKey === f!.topKey && !x.advanced,
  ).findIndex((x) => x.path === path)
  return { groupIdx, fieldIdx }
}

test('menu: a Cyrillic value split between reads is not corrupted', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = {}
  const { groupIdx, fieldIdx } = pathIndex('diagnostics.command')

  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('en'),
    get: (path) => store[path],
    set: (field, raw) => {
      store[field.path] = raw
    },
    reset: (field) => {
      delete store[field.path]
    },
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })

  input.emit('data', Buffer.from(DOWN.repeat(groupIdx) + ENTER))
  for (let i = 0; i < fieldIdx; i++) input.emit('data', Buffer.from(DOWN))
  input.emit('data', Buffer.from(ENTER))
  const bytes = Buffer.from('\u044b', 'utf8')
  input.emit('data', bytes.subarray(0, 1))
  await new Promise((r) => setImmediate(r))
  input.emit('data', bytes.subarray(1))
  input.emit('data', Buffer.from(ENTER))

  assert.equal(
    store['diagnostics.command'],
    '\u044b',
    'saved value: ' + JSON.stringify(store['diagnostics.command']),
  )

  input.emit('data', Buffer.from('q'))
  await p
})
