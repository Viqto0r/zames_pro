import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTools } from '../src/tools.ts'
import { buildSystemPrompt } from '../src/system-prompt.ts'

// N6: the system prompt is sent into EVERY new chat, so it silently eats the
// web-chat context window before the first task line. Nothing measured it, so
// an innocent tool description or a new prompt section could push every chat
// closer to "Length limit reached". This test pins the size; raising the
// budget is a deliberate edit here (with a reason), not an accident.
//
// The prompt is built WITHOUT project context (no AGENTS.md/MEMORY/skills):
// that part depends on the user's project and is reported by /context.

// Measured 21881 bytes for the full default tool set (subagents on, RU locale
// — the locale does not change the agent-facing text). +10% headroom for
// wording tweaks; a real feature addition bumps this on purpose.
const BUDGET_BYTES = 24000

function defaultPrompt(): string {
  const workdir = process.cwd()
  const tools = createTools(workdir, { subagents: true })
  return buildSystemPrompt({ workdir, tools })
}

test('the default system prompt stays within the size budget', () => {
  const sp = defaultPrompt()
  const bytes = Buffer.byteLength(sp)
  assert.ok(
    bytes <= BUDGET_BYTES,
    `the system prompt grew to ${bytes} bytes (budget ${BUDGET_BYTES}). ` +
      'Move detail into docs/DESIGN-NOTES.md or shorten a tool description.',
  )
})

test('the budget is not wildly above the real size (no silent slack)', () => {
  const bytes = Buffer.byteLength(defaultPrompt())
  // A budget far above the actual prompt would stop catching growth.
  assert.ok(
    BUDGET_BYTES - bytes < BUDGET_BYTES * 0.25,
    `the budget ${BUDGET_BYTES} is more than 25% above the real ${bytes}`,
  )
})
