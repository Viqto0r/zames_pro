import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { parseToolCall } from '../src/agent-loop.ts'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

const Q = String.fromCharCode(34)
const NL = String.fromCharCode(10)

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

// --- Parser edge cases that may expose bugs ---

test('Bash с командной подстановкой (...) распознаётся целиком', () => {
  const cmd = 'echo ' + Q + 'total: ' + Q + '(ls | wc -l)' + Q
  const text = JSON.stringify({ tool: 'Bash', args: { command: cmd } })
  const res = parseToolCall(text) as { tool: string; args: Record<string, unknown> }
  assert.ok(res, 'вызов должен распознаться')
  assert.equal(res.tool, 'Bash')
  assert.equal(res.args['command'], cmd)
})

test('Write с content, содержащим фигурные скобки и , распознаётся', () => {
  const content = 'function f() { return 1 }' + NL + 'const x = ' + Q + '{y}' + Q
  const text = JSON.stringify({ tool: 'Write', args: { path: 'a.js', content } })
  const res = parseToolCall(text) as { args: Record<string, unknown> }
  assert.ok(res)
  assert.equal(res.args['content'], content)
})

test('Edit с $ и обратными слэшами в new_string распознаётся', () => {
  const newStr = 'path = C:' + String.fromCharCode(92) + 'dir' + String.fromCharCode(92) + 'file'
  const text = JSON.stringify({
    tool: 'Edit',
    args: { path: 'x.txt', old_string: 'a', new_string: newStr },
  })
  const res = parseToolCall(text) as { args: Record<string, unknown> }
  assert.ok(res)
  assert.equal(res.args['new_string'], newStr)
})

// --- The Grep tool (was not covered before) ---

test('Grep находит совпадения по регулярному выражению', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-grep-'))
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello world', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Grep').fn({ pattern: 'world' }))
  assert.ok(out.includes('world'), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Grep возвращает понятный результат при отсутствии совпадений', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-grep-'))
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Grep').fn({ pattern: 'zzz_no_match' }))
  assert.ok(!/hello/.test(out), 'не должно быть ложных совпадений: ' + out)
  await fs.rm(dir, { recursive: true, force: true })
})
