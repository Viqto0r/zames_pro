import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runConfigMenu } from '../src/config-menu.ts'
import { CONFIG_SCHEMA, CONFIG_TOP_GROUPS } from '../src/config.ts'
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

const DOWN = '\x1b[B'
const ENTER = '\r'

// The menu is TWO-LEVEL: `/config` lists the GROUPS, Enter opens one and only
// then the settings are reachable. Every test therefore has to pick a group
// first — this helper returns the down-arrow sequence that lands on the group
// holding `path`.
function groupOf(path: string): string {
  const f = CONFIG_SCHEMA.find((x) => x.path === path)
  assert.ok(f, 'no schema entry for ' + path)
  return f!.topKey
}

function groupsPresent(): string[] {
  return [...CONFIG_TOP_GROUPS].filter((g) =>
    CONFIG_SCHEMA.some((f) => f.topKey === g && !f.advanced),
  )
}

function openGroupSeq(path: string): string {
  const idx = groupsPresent().indexOf(groupOf(path))
  assert.ok(idx >= 0, 'group is not offered for ' + path)
  return DOWN.repeat(idx) + ENTER
}

function indexInGroup(path: string): number {
  const g = groupOf(path)
  return CONFIG_SCHEMA.filter((f) => f.topKey === g && !f.advanced).findIndex(
    (f) => f.path === path,
  )
}

test('меню: Enter на boolean переключает значение', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const store: Record<string, unknown> = { debug: false }
  let cursorPath = ''

  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
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

  // Open the Agent group, walk down to debug, toggle.
  input.emit('data', Buffer.from(openGroupSeq('debug')))
  for (let i = 0; i < indexInGroup('debug'); i++) {
    input.emit('data', Buffer.from(DOWN))
  }
  input.emit('data', Buffer.from(ENTER)) // Enter → toggle
  assert.equal(cursorPath, 'debug')
  assert.equal(store.debug, true)

  // Enter again → back to false.
  input.emit('data', Buffer.from(ENTER))
  assert.equal(store.debug, false)

  input.emit('data', Buffer.from('q'))
  await p
  assert.ok(output.data.length > 0)
})

test('меню: Esc внутри группы возвращает к списку групп', async () => {
  const input = new FakeIn()
  const output = new FakeOut()
  const p = runConfigMenu({
    fields: CONFIG_SCHEMA,
    t: translate('ru'),
    get: () => undefined,
    set: () => {},
    reset: () => {},
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  })
  const before = output.data.length
  // Open the first group, then Esc back to the groups: the group list must be
  // painted again (its title appears in the fresh output).
  input.emit('data', Buffer.from(ENTER))
  const inGroup = output.data.slice(before)
  assert.ok(inGroup.includes(translate('ru')('cfg.menu.hint')))
  const afterOpen = output.data.length
  input.emit('data', Buffer.from('\x1b'))
  const back = output.data.slice(afterOpen)
  assert.ok(back.includes(translate('ru')('cfg.menu.groups_title')))
  input.emit('data', Buffer.from('q'))
  await p
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
  input.emit('data', Buffer.from(openGroupSeq('debug')))
  for (let i = 0; i < indexInGroup('debug'); i++) {
    input.emit('data', Buffer.from(DOWN))
  }
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
  input.emit('data', Buffer.from(openGroupSeq('maxIterations')))
  for (let i = 0; i < indexInGroup('maxIterations'); i++) {
    input.emit('data', Buffer.from(DOWN))
  }
  input.emit('data', Buffer.from(ENTER)) // enter edit mode
  input.emit('data', Buffer.from('\x7f\x7f')) // erase "40"
  input.emit('data', Buffer.from('25'))
  input.emit('data', Buffer.from(ENTER)) // save
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
  // The filter works INSIDE an open group; debug lives in the Agent group.
  input.emit('data', Buffer.from(openGroupSeq('debug')))
  // Type the filter "debug", then Enter to leave the filter (keeping it),
  // then Enter again toggles the single visible field.
  input.emit('data', Buffer.from('/debug'))
  input.emit('data', Buffer.from(ENTER))
  input.emit('data', Buffer.from(ENTER))
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
  input.emit('data', Buffer.from(openGroupSeq('debug')))
  for (let i = 0; i < indexInGroup('debug'); i++) {
    input.emit('data', Buffer.from(DOWN))
  }
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
  // The group list must fit too.
  let prev = output.data.length
  let worst = 0
  for (let i = 0; i < groupsPresent().length + 2; i++) {
    input.emit('data', Buffer.from(DOWN))
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

  // Open the longest group and walk its whole list: every render must fit
  // rows-1 newlines so the block never scrolls the top off (which broke the
  // cursor restore), AND the SELECTED row must always be inside the window.
  const longest = groupsPresent()
    .map((g) => ({
      g,
      n: CONFIG_SCHEMA.filter((f) => f.topKey === g && !f.advanced).length,
    }))
    .sort((a, b) => b.n - a.n)[0]
  const idx = groupsPresent().indexOf(longest.g)
  input.emit('data', Buffer.from(DOWN.repeat(idx < 0 ? 0 : 0)))
  // Land on the group (groupCursor is already somewhere) and open it.
  for (let i = 0; i < groupsPresent().length; i++) {
    input.emit('data', Buffer.from(DOWN))
  }
  // Walk to the wanted group deterministically: reopen from the top.
  input.emit('data', Buffer.from(ENTER))
  prev = output.data.length
  for (let i = 0; i < longest.n + 2; i++) {
    input.emit('data', Buffer.from(DOWN))
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
  // One packet: group selection (downs + Enter) AND the walk to debug AND
  // Enter, all at once — the parser must not drop the tail.
  const seq =
    DOWN.repeat(groupsPresent().indexOf(groupOf('debug'))) +
    ENTER +
    DOWN.repeat(indexInGroup('debug')) +
    ENTER
  input.emit('data', Buffer.from(seq))
  assert.equal(setPath, 'debug')
  assert.equal(store.debug, true)
  input.emit('data', Buffer.from('q'))
  await p
})
