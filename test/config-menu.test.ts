import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runConfigMenu } from '../src/config-menu.ts'
import { CONFIG_SCHEMA } from '../src/config.ts'
import { translate } from '../src/i18n.ts'

// Minimal fake stream: EventEmitter + isTTY/setRawMode + a write stub.
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

test('меню: Enter на boolean переключает значение', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: false }
  let cursorPath = ''

  // Put the cursor on debug (boolean). Find its index and scroll down.
  const fields = CONFIG_SCHEMA
  const debugIdx = fields.findIndex((f) => f.path === 'debug')
  assert.ok(debugIdx >= 0)

  const p = runConfigMenu({
    fields,
    t: translate('ru'),
    get: (path) => store[path],
    set: (field, raw) => {
      cursorPath = field.path
      store[field.path] = raw === 'true'
    },
    reset: (field) => {
      delete store[field.path]
    },
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })

  // Go down to debug.
  for (let i = 0; i < debugIdx; i++) input.emit('data', Buffer.from('\x1b[B'))
  input.emit('data', Buffer.from('\r')) // Enter → toggle
  assert.equal(cursorPath, 'debug')
  assert.equal(store.debug, true)

  // Enter again → back to false.
  input.emit('data', Buffer.from('\r'))
  assert.equal(store.debug, false)

  input.emit('data', Buffer.from('q'))
  await p
  assert.ok(output.data.length > 0)
})

test('меню: d сбрасывает поле к дефолту', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: true }
  let resetPath = ''
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: () => {},
    reset: (field) => {
      resetPath = field.path
      delete store[field.path]
    },
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  const debugIdx = CONFIG_SCHEMA.findIndex((f) => f.path === 'debug')
  for (let i = 0; i < debugIdx; i++) input.emit('data', Buffer.from('\x1b[B'))
  // A single `d` only ARMS the reset (a guard against a stray keypress);
  // the second `d` on the same row actually resets.
  input.emit('data', Buffer.from('d'))
  assert.equal(resetPath, '')
  input.emit('data', Buffer.from('d'))
  assert.equal(resetPath, 'debug')
  input.emit('data', Buffer.from('q'))
  await p
})

test('меню: number открывает ввод и сохраняет', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { maxIterations: 40 }
  let saved: string | null = null
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: (field, raw) => {
      saved = raw
      store[field.path] = Number(raw)
    },
    reset: () => {},
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  // maxIterations is the first after ui.locale (enum), go down by 1.
  input.emit('data', Buffer.from('\x1b[B'))
  input.emit('data', Buffer.from('\r')) // enter edit mode
  input.emit('data', Buffer.from('\x7f\x7f')) // erase "40"
  input.emit('data', Buffer.from('25'))
  input.emit('data', Buffer.from('\r')) // save
  assert.equal(saved, '25')
  assert.equal(store.maxIterations, 25)
  input.emit('data', Buffer.from('q'))
  await p
})

test('меню: фильтр «/» сужает список по подстроке', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: false }
  let setPath = ''
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: (field, raw) => {
      setPath = field.path
      store[field.path] = raw === 'true'
    },
    reset: () => {},
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  // Type the filter "debug", then Enter to leave the filter (keeping it),
  // then Enter again toggles the single visible field.
  input.emit('data', Buffer.from('/debug'))
  input.emit('data', Buffer.from('\r'))
  input.emit('data', Buffer.from('\r'))
  assert.equal(setPath, 'debug')
  assert.equal(store.debug, true)
  input.emit('data', Buffer.from('q'))
  await p
})

test('меню: d требует подтверждения второго нажатия', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: true }
  const resetPaths: string[] = []
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: () => {},
    reset: (field) => {
      resetPaths.push(field.path)
      delete store[field.path]
    },
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  const debugIdx = CONFIG_SCHEMA.findIndex((f) => f.path === 'debug')
  for (let i = 0; i < debugIdx; i++) input.emit('data', Buffer.from('\x1b[B'))
  // Moving with j must CLEAR the armed reset.
  input.emit('data', Buffer.from('d'))
  input.emit('data', Buffer.from('j'))
  input.emit('data', Buffer.from('d'))
  assert.equal(resetPaths.length, 0)
  input.emit('data', Buffer.from('q'))
  await p
})

test('меню: окно не превышает высоту терминала и скроллит список', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  output.rows = 12
  const store: Record<string, unknown> = { debug: false }
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: () => {},
    reset: () => {},
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  // Walk the whole list; every render must fit rows-1 newlines so the block
  // never scrolls the top off (which broke the cursor restore), AND the
  // SELECTED row (the ❯ marker) must always be inside the printed window.
  let prev = output.data.length
  let worst = 0
  for (let i = 0; i < CONFIG_SCHEMA.length + 2; i++) {
    input.emit('data', Buffer.from('\x1b[B'))
    const delta = output.data.slice(prev)
    prev = output.data.length
    const nl = (delta.match(/\n/g) || []).length
    if (nl > worst) worst = nl
    assert.ok(
      delta.includes('\u276f'),
      'selected row missing from the window at step ' + i,
    )
  }
  assert.ok(worst <= output.rows - 1, 'render height ' + worst + ' > rows-1')
  input.emit('data', Buffer.from('q'))
  await p
})

test('меню: пакет клавиш (стрелки+Enter) обрабатывается целиком', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: false }
  let setPath = ''
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: (path) => store[path],
    set: (field, raw) => {
      setPath = field.path
      store[field.path] = raw === 'true'
    },
    reset: () => {},
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  const debugIdx = CONFIG_SCHEMA.findIndex((f) => f.path === 'debug')
  // One packet: debugIdx down-arrows + Enter.
  const seq = '\x1b[B'.repeat(debugIdx) + '\r'
  input.emit('data', Buffer.from(seq))
  assert.equal(setPath, 'debug')
  assert.equal(store.debug, true)
  input.emit('data', Buffer.from('q'))
  await p
})
