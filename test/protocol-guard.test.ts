import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function makeBrowser(script: string[]): { browser: BrowserLike } {
 let i = 0
 const browser: BrowserLike = {
 async ask() {
 const r = script[i]
 i++
 if (r === undefined) throw new Error('script exhausted')
 return r
 },
 async newChat() {},
 async getCurrentChatId() { return 'chat-xyz' },
 async stopGeneration() { return true },
 async listChats() { return [] },
 async openChat() { return true },
 async close() {},
 }
 return { browser }
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
 return JSON.stringify({ tool, args })
}

const echoTool: ToolDef = {
 name: 'Echo',
 description: 'echo',
 parameters: { v: 'string' },
 fn: async () => 'echo-ok',
}

const respondTool: ToolDef = {
 name: 'respond',
 description: 'respond',
 parameters: { message: 'string' },
 fn: async (a) => String(a['message']),
}

// STRUCTURAL guard: once a tool ran in the task, a plain-text answer that is
// neither a tool call nor a real respond must NOT be returned as a clean final
// answer (the "agent slipped into chat mode" symptom). We key on the structure
// (a tool already ran), not on matching any particular words.
test('текст-рассуждение после инструмента не выдаётся как финал', async () => {
 const script: string[] = [jsonCall('Echo', { v: '1' })]
 for (let i = 0; i < 30; i++) {
 script.push('Теперь всё ясно. Разберём, что реально произошло.')
 }
 const { browser } = makeBrowser(script)
 const events: string[] = []
 const transcript = {
 log: (event: string) => {
 events.push(event)
 },
 }
 const result = await runAgentLoop({
 browser,
 tools: [echoTool, respondTool],
 task: 'x',
 workdir: process.cwd(),
 maxIterations: 40,
 transcript,
 })
 assert.ok(
 result.includes('may be incomplete') || result.includes('before finishing'),
 'ожидается пометка о незавершённости: ' + JSON.stringify(result.slice(0, 200)),
 )
 assert.ok(
 events.includes('protocol_violation_final'),
 'события: ' + JSON.stringify(events.slice(-6)),
 )
})

// A genuine short final (respond) must still finish cleanly, even after tools.
test('настоящий respond после инструмента завершает задачу нормально', async () => {
 const script: string[] = [
 jsonCall('Echo', { v: '1' }),
 jsonCall('respond', { message: 'готово' }),
 ]
 const { browser } = makeBrowser(script)
 const result = await runAgentLoop({
 browser,
 tools: [echoTool, respondTool],
 task: 'x',
 workdir: process.cwd(),
 maxIterations: 20,
 })
 assert.equal(result, 'готово')
})

// The guard must NOT fire when no tool has run in the task: it keys on the
// structure (work started), so a plain answer without tools is left alone.
test('без tool call guard не срабатывает', async () => {
 const script: string[] = []
 for (let i = 0; i < 30; i++) {
 script.push('Просто ответ без инструментов.')
 }
 const { browser } = makeBrowser(script)
 const events: string[] = []
 const transcript = {
 log: (event: string) => {
 events.push(event)
 },
 }
 await runAgentLoop({
 browser,
 tools: [echoTool, respondTool],
 task: 'x',
 workdir: process.cwd(),
 maxIterations: 10,
 transcript,
 })
 assert.ok(
 !events.includes('protocol_violation_final'),
 'guard не должен срабатывать без tool call: ' + JSON.stringify(events),
 )
})
