import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatus, doctorProbeSummary } from '../src/status-command.ts'
import { translate } from '../src/i18n.ts'
import type { StatusInput } from '../src/status-command.ts'

// test/status-command.test.ts pins that 19 rows exist and that a bare session
// says none/unknown; test/status-command-junk.test.ts pins the newline/NaN
// guards. What each row actually SHOWS was never pinned: an inverted boolean
// or a swapped `fresh_next`/`prompt_next` row would still pass both files.
// The translator here keeps the key and the params visible, so a row is
// checked by WHAT it carries, not by its wording.

const t = (k: string, p?: Record<string, string | number>): string =>
  k + (p ? JSON.stringify(p) : '')

function base(p: Partial<StatusInput> = {}): StatusInput {
  return {
    workdir: '/p',
    reviewMode: null,
    chatId: null,
    freshNext: false,
    promptNext: false,
    lastChat: null,
    sessionsDir: '/h/.zames/.sessions',
    devMode: false,
    maxIterations: 0,
    headless: true,
    debug: false,
    deepThinking: false,
    webSearch: false,
    undo: false,
    checkpoint: false,
    transcriptFile: null,
    goal: null,
    localeName: 'English',
    mcpToolCount: null,
    tokenUsage: null,
    ...p,
  }
}

function row(s: StatusInput, key: string): string {
  const lines = formatStatus(s, t).filter((l) => l.startsWith(key + '{'))
  assert.equal(lines.length, 1, 'expected exactly one ' + key + ' row')
  return lines[0]
}

// The stub translator returns the KEY, so a boolean row carries the KEY its
// own code path picked (and a swap shows up as `common.no` where `common.yes`
// was expected).
const yes = 'common.yes'
const no = 'common.no'
const on = 'common.on'
const off = 'common.off'
const unknownKey = 'common.unknown'
const noneKey = 'common.none'

function param(line: string, name: string): string {
  const p = JSON.parse(line.slice(line.indexOf('{'))) as Record<string, string>
  return p[name]
}

test('every status row carries the value of ITS field', () => {
  const s = base({
    workdir: '/work',
    chatId: 'chat-7',
    lastChat: 'chat-6',
    sessionsDir: '/sess',
    localeName: 'Русский',
    transcriptFile: '/t.jsonl',
    goal: 'all tests pass',
    maxIterations: 25,
    mcpToolCount: 4,
    tokenUsage: 1234,
  })
  assert.equal(param(row(s, 'status.workdir'), 'v'), '/work')
  assert.equal(param(row(s, 'status.chat'), 'v'), 'chat-7')
  assert.equal(param(row(s, 'status.last_chat'), 'v'), 'chat-6')
  assert.equal(param(row(s, 'status.sessions'), 'v'), '/sess')
  assert.equal(param(row(s, 'status.locale'), 'v'), 'Русский')
  assert.equal(param(row(s, 'status.transcript'), 'v'), '/t.jsonl')
  assert.equal(param(row(s, 'status.goal'), 'v'), 'all tests pass')
  assert.equal(param(row(s, 'status.max_iter'), 'v'), '25')
  assert.equal(param(row(s, 'status.mcp'), 'v'), '4')
  assert.equal(param(row(s, 'status.tokens'), 'v'), '1234')
})

test('the boolean rows are not swapped (fresh/prompt/headless/debug)', () => {
  const on = base({ freshNext: true, promptNext: false })
  assert.equal(param(row(on, 'status.fresh_next'), 'v'), yes)
  assert.equal(param(row(on, 'status.prompt_next'), 'v'), no)
  const flipped = base({ freshNext: false, promptNext: true })
  assert.equal(param(row(flipped, 'status.fresh_next'), 'v'), no)
  assert.equal(param(row(flipped, 'status.prompt_next'), 'v'), yes)
  assert.equal(
    param(row(base({ headless: true }), 'status.headless'), 'v'),
    yes,
  )
  assert.equal(
    param(row(base({ headless: false }), 'status.headless'), 'v'),
    no,
  )
  assert.equal(param(row(base({ debug: true }), 'status.debug'), 'v'), yes)
  assert.equal(param(row(base({ debug: false }), 'status.debug'), 'v'), no)
})

test('the toggles row carries BOTH switches under their own names', () => {
  const thinkOnly = formatStatus(
    base({ deepThinking: true, webSearch: false }),
    t,
  ).filter((l) => l.startsWith('status.toggles'))[0]
  const p = JSON.parse(thinkOnly.slice(thinkOnly.indexOf('{'))) as Record<
    string,
    string
  >
  assert.equal(p.think, yes)
  assert.equal(p.search, no)
  const searchOnly = formatStatus(
    base({ deepThinking: false, webSearch: true }),
    t,
  ).filter((l) => l.startsWith('status.toggles'))[0]
  const q = JSON.parse(searchOnly.slice(searchOnly.indexOf('{'))) as Record<
    string,
    string
  >
  assert.equal(q.think, no)
  assert.equal(q.search, yes)
})

test('undo/checkpoint/devMode render as on/off words, not raw booleans', () => {
  const bothOn = base({ undo: true, checkpoint: true, devMode: true })
  assert.equal(param(row(bothOn, 'status.undo'), 'v'), on)
  assert.equal(param(row(bothOn, 'status.checkpoint'), 'v'), on)
  assert.equal(param(row(bothOn, 'status.dev'), 'v'), on)
  const bothOff = base({ undo: false, checkpoint: false, devMode: false })
  assert.equal(param(row(bothOff, 'status.undo'), 'v'), off)
  assert.equal(param(row(bothOff, 'status.dev'), 'v'), off)
})

test('review mode replaces the `no` fallback and adds the orig-dir row', () => {
  const plain = base()
  assert.equal(param(row(plain, 'status.review_mode'), 'v'), no)
  const review = base({ reviewMode: 'snap1', origDir: '/orig' })
  assert.equal(param(row(review, 'status.review_mode'), 'v'), 'snap1')
  assert.equal(param(row(review, 'status.orig_dir'), 'v'), '/orig')
})

test('a negative MCP count and a negative token count say unknown', () => {
  const unknown = unknownKey
  assert.equal(
    param(row(base({ mcpToolCount: -2 }), 'status.mcp'), 'v'),
    unknown,
  )
  assert.equal(param(row(base({ mcpToolCount: 0 }), 'status.mcp'), 'v'), '0')
  assert.equal(
    param(row(base({ tokenUsage: -5 }), 'status.tokens'), 'v'),
    unknown,
  )
  assert.equal(param(row(base({ tokenUsage: 0 }), 'status.tokens'), 'v'), '0')
})

test('the transcript row says off when there is no file', () => {
  assert.equal(param(row(base(), 'status.transcript'), 'v'), off)
})

// ---------- doctorProbeSummary: each row's status and text ----------

test('the doctor rows cover git, auth and the MCP pool', () => {
  const ok = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'main',
    mcpServers: 2,
    mcpTools: 5,
    authSaved: true,
  })
  assert.deepEqual(ok, [
    { status: 'ok', label: 'git: main' },
    { status: 'ok', label: 'auth: saved' },
    { status: 'ok', label: 'mcp: 2 servers / 5 tools' },
  ])
})

test('a detached/absent repo and a missing auth marker are warnings', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: null,
    mcpServers: 0,
    mcpTools: 0,
    authSaved: false,
  })
  assert.deepEqual(rows[0], { status: 'ok', label: 'git: detached' })
  assert.deepEqual(rows[1], { status: 'warn', label: 'auth: not saved' })
  // No tools -> the row is a warning even with servers configured.
  assert.deepEqual(rows[2], {
    status: 'warn',
    label: 'mcp: 0 servers / 0 tools',
  })
  const absent = doctorProbeSummary({
    gitOk: false,
    gitBranch: 'main',
    mcpServers: 0,
    mcpTools: 0,
    authSaved: true,
  })
  assert.deepEqual(absent[0], { status: 'warn', label: 'git: absent' })
})

test('missing UI capabilities add ONE warn row, joined and flattened', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'main',
    mcpServers: 0,
    mcpTools: 0,
    authSaved: true,
    uiMissingCritical: ['input', 'send\nnewline'],
  })
  assert.equal(rows.length, 4)
  assert.equal(rows[3].status, 'warn')
  assert.equal(rows[3].label, 'ui: missing input, send newline')
  // An EMPTY list adds no row at all.
  const none = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'main',
    mcpServers: 0,
    mcpTools: 0,
    authSaved: true,
    uiMissingCritical: [],
  })
  assert.equal(none.length, 3)
})
