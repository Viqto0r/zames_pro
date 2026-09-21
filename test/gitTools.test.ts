import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGitTools, formatGitContext } from '../src/gitTools.ts'
import type { ToolDef, GitContext } from '../src/types.ts'

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('в git-репозитории GitStatus возвращает статус', async () => {
  const tools = createGitTools(process.cwd())
  const out = String(await tool(tools, 'GitStatus').fn({}))
  assert.ok(/branch|On branch|не git/i.test(out), out)
})

test('GitLog возвращает коммиты без ошибок shell', async () => {
  const tools = createGitTools(process.cwd())
  const out = String(await tool(tools, 'GitLog').fn({ count: 2 }))
  assert.ok(!/Syntax error/i.test(out), out)
  assert.ok(!/Exit code/i.test(out), out)
})

test('вне git-репозитория git-инструменты сообщают об этом', async () => {
  const tools = createGitTools('/tmp')
  const out = String(await tool(tools, 'GitStatus').fn({}))
  assert.ok(/Not a git repository/i.test(out) || /branch/i.test(out), out)
})

test('formatGitContext(null) сообщает, что это не репозиторий', () => {
  const s = formatGitContext(null)
  assert.ok(/not a git repository/i.test(s), s)
})

test('formatGitContext подставляет значения ветки и изменений', () => {
  const ctx: GitContext = {
    branch: 'feature/x',
    changedFiles: 3,
    statusPreview: 'M a.ts',
    hasOrigin: true,
    ahead: 1,
    behind: 2,
  }
  const s = formatGitContext(ctx)
  assert.ok(s.includes('feature/x'), s)
  assert.ok(s.includes('3 file'), s)
  assert.ok(s.includes('ahead 1'), s)
  assert.ok(s.includes('behind 2'), s)
})
