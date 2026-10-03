import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LineEditor,
  formatTokenStatus,
  formatCompactTokens,
  tokenStatusLevel,
  CONTEXT_LIMIT,
  CONTEXT_YELLOW_PCT,
  CONTEXT_RED_PCT,
} from '../src/input.ts'
import {
  buildCompactPrompt,
  buildCompactCarryover,
  isUsableCompactSummary,
} from '../src/commands.ts'

// ---------- token status formatting ----------

test('formatTokenStatus: compact k/M and percent of the limit', () => {
  assert.equal(formatTokenStatus(0), 'ctx: 0 · 0.0%')
  assert.equal(formatTokenStatus(999), 'ctx: 999 · 0.1%')
  assert.equal(formatTokenStatus(10_000), 'ctx: 10k · 1.0%')
  assert.equal(formatTokenStatus(125_000), 'ctx: 125k · 13%')
  assert.equal(formatTokenStatus(1_000_000), 'ctx: 1M · 100%')
  assert.equal(formatTokenStatus(1_500_000), 'ctx: 1.5M · 150%')
})

test('formatTokenStatus: null/undefined/NaN hide the status', () => {
  assert.equal(formatTokenStatus(null), '')
  assert.equal(formatTokenStatus(undefined), '')
  assert.equal(formatTokenStatus(Number.NaN), '')
  assert.equal(formatTokenStatus(-5), '')
})

test('formatTokenStatus: honors a custom limit', () => {
  assert.equal(formatTokenStatus(50, 100), 'ctx: 50 · 50%')
})

test('formatCompactTokens: k/M compaction, shared with the context counter', () => {
  assert.equal(formatCompactTokens(0), '0')
  assert.equal(formatCompactTokens(999), '999')
  assert.equal(formatCompactTokens(10_000), '10k')
  assert.equal(formatCompactTokens(125_000), '125k')
  assert.equal(formatCompactTokens(1_000_000), '1M')
  assert.equal(formatCompactTokens(1_500_000), '1.5M')
  // Invalid input renders an empty string (the token part is omitted).
  assert.equal(formatCompactTokens(null), '')
  assert.equal(formatCompactTokens(Number.NaN), '')
  assert.equal(formatCompactTokens(-1), '')
})

test('tokenStatusLevel: green/yellow/red thresholds', () => {
  assert.equal(tokenStatusLevel(0), 'ok')
  // 499_999 tokens -> 49.9999% -> green; 500_000 -> 50% -> yellow
  assert.equal(tokenStatusLevel(499_999), 'ok')
  assert.equal(tokenStatusLevel(500_000), 'warn')
  assert.equal(tokenStatusLevel(799_999), 'warn')
  assert.equal(tokenStatusLevel(800_000), 'high')
  assert.equal(tokenStatusLevel(1_500_000), 'high')
})

test('tokenStatusLevel: null for invalid input', () => {
  assert.equal(tokenStatusLevel(null), null)
  assert.equal(tokenStatusLevel(undefined), null)
  assert.equal(tokenStatusLevel(Number.NaN), null)
  assert.equal(tokenStatusLevel(-1), null)
})

test('tokenStatusLevel: honors a custom limit', () => {
  assert.equal(tokenStatusLevel(50, 100), 'warn')
  assert.equal(tokenStatusLevel(80, 100), 'high')
  assert.equal(tokenStatusLevel(10, 100), 'ok')
})

test('CONTEXT_LIMIT is 1M', () => {
  assert.equal(CONTEXT_LIMIT, 1_000_000)
})

// ---------- editor status line ----------

test('setContextStatus stores the formatted token text', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.setContextStatus(12_500)
  assert.equal(e.contextStatus, 'ctx: 12.5k · 1.3%')
})

test('onContextQuery refreshes the context on every render', () => {
  const e = new LineEditor()
  e._render = () => {}
  let value: number | null = 1000
  e.onContextQuery = () => value
  assert.equal(e._contextForRender(), 'ctx: 1k · 0.1%')
  value = 250_000
  assert.equal(e._contextForRender(), 'ctx: 250k · 25%')
  value = null
  assert.equal(e._contextForRender(), null)
})

test('context text carries a text marker at warn/high (color-blind safe)', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.contextTokens = 0
  e.contextStatus = formatTokenStatus(0)
  assert.ok(!e._contextText().includes('▲'))
  assert.ok(!e._contextText().includes('⛔'))
  e.contextTokens = 600_000
  e.contextStatus = formatTokenStatus(600_000)
  assert.ok(e._contextText().includes('▲'))
  e.contextTokens = 900_000
  e.contextStatus = formatTokenStatus(900_000)
  assert.ok(e._contextText().includes('⛔'))
})

test('a throwing onContextQuery does not break the render', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.onContextQuery = () => {
    throw new Error('boom')
  }
  assert.equal(e._contextForRender(), null)
})

test('queue badge shows only when messages are waiting', () => {
  const e = new LineEditor()
  e._render = () => {}
  assert.equal(e._queueBadge(), '')
  e.queueLength = 3
  assert.ok(e._queueBadge().includes('3'))
  // onQueueQuery overrides the stored value on each render.
  let q = 0
  e.onQueueQuery = () => q
  assert.equal(e._queueBadge(), '')
  q = 2
  assert.ok(e._queueBadge().includes('2'))
  // A throwing callback must not break the render (keeps the last value).
  e.onQueueQuery = () => {
    throw new Error('boom')
  }
  assert.ok(e._queueBadge().includes('2'))
})

// ---------- /compact prompt helpers ----------

test('buildCompactPrompt: both languages, self-sufficient instructions', () => {
  const ru = buildCompactPrompt('ru')
  const en = buildCompactPrompt('en')
  assert.ok(ru.length > 50 && en.length > 50)
  assert.notEqual(ru, en)
  assert.ok(/резюме/i.test(ru))
  assert.ok(/summary/i.test(en))
  // The summary must carry the state, not just a topic list.
  assert.ok(ru.includes('следующие конкретные шаги'))
  assert.ok(en.includes('next concrete steps'))
})

test('buildCompactCarryover: wraps the summary and keeps the goal', () => {
  const out = buildCompactCarryover('did X and Y', 'finish Z')
  assert.ok(out.includes('did X and Y'))
  assert.ok(out.includes('Original task: finish Z'))
  assert.ok(/compacted/i.test(out))
})

test('buildCompactCarryover: no goal, empty summary is safe', () => {
  const out = buildCompactCarryover('', '')
  assert.ok(out.length > 0)
  assert.ok(!out.includes('Original task:'))
})

// ---------- /compact summary guard ----------
//
// The /compact prompt is sent into the OLD chat as a normal turn, so in
// reasoning mode DeepSeek answered it with a Bash TOOL CALL ("gather the
// current state") instead of prose — only a THINK fragment, no summary. That
// tool-call JSON must NOT be carried into the new chat (it would make the new
// chat re-run an old command), so an unusable answer must fall back to the
// LOCAL history summary.

test('isUsableCompactSummary: accepts real prose summaries', () => {
  assert.equal(
    isUsableCompactSummary(
      'Краткое резюме: сделано то и то, следующий шаг — добить тесты.',
    ),
    true,
  )
  assert.equal(
    isUsableCompactSummary(
      'Summary: implemented the Continue-button fix; next step is to run the test suite and commit.',
    ),
    true,
  )
})

test('isUsableCompactSummary: rejects tool-call JSON / DSML / sentinels', () => {
  // The exact shape observed live: the model emitted a Bash tool call.
  const toolCall =
    '{"tool": "Bash", "args": {"command": "cd /home/viqtor/projects/zames && git log --oneline -15"}}'
  assert.equal(isUsableCompactSummary(toolCall), false)
  // A respond-wrapped call is still a tool call, not a summary.
  assert.equal(
    isUsableCompactSummary('{"tool":"respond","args":{"message":"ok"}}'),
    false,
  )
  // DSML tool-call syntax.
  assert.equal(isUsableCompactSummary('<|DSML|invoke name="Bash">'), false)
  // A cut-off body that still carries args.
  assert.equal(
    isUsableCompactSummary('something "args": { "path": "x" }'),
    false,
  )
  // Safety blocks and the abort sentinel are not summaries.
  assert.equal(isUsableCompactSummary('<ds_safety>Safe</ds_safety>'), false)
  assert.equal(isUsableCompactSummary('(прервано пользователем)'), false)
})

test('isUsableCompactSummary: rejects empty / too short answers', () => {
  assert.equal(isUsableCompactSummary(''), false)
  assert.equal(isUsableCompactSummary('   '), false)
  assert.equal(isUsableCompactSummary('ok'), false)
})
