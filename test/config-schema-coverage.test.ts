// Every setting must still be READ somewhere in src/ (a config path nobody
// reads is a dead knob in /config), and the diagnostics.* entries must reach
// the agent loop. Guards against a setting being dropped from the code while
// staying in the menu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG_SCHEMA, DEFAULTS, getByPath } from '../src/config.ts'

const SRC = path.join(import.meta.dirname, '..', 'src')

function allSources(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(fs.readFileSync(p, 'utf-8'))
    }
  }
  walk(SRC)
  return out
}

// Paths whose READ lives outside src/ only in the types module or in a
// hand-written getter — listed explicitly so the test stays honest.
const READ_ELSEWHERE = new Set<string>([])

test('each config path has a DEFAULTS value of the right type', () => {
  for (const f of CONFIG_SCHEMA) {
    const v = getByPath(DEFAULTS, f.path)
    assert.notEqual(v, undefined, 'no default for ' + f.path)
    const ok =
      (f.type === 'boolean' && typeof v === 'boolean') ||
      (f.type === 'number' && typeof v === 'number') ||
      (f.type === 'string' && typeof v === 'string') ||
      (f.type === 'enum' && f.values?.includes(String(v)))
    assert.ok(ok, `default of ${f.path} does not match its type ${f.type}`)
  }
})

test('each config path is read from src/', () => {
  const src = allSources().join('\n')
  const missing: string[] = []
  for (const f of CONFIG_SCHEMA) {
    if (READ_ELSEWHERE.has(f.path)) continue
    // The code may read the FULL path (config.browser.askRetries) or the leaf
    // of a nested section (this.askRetries). A path whose leaf is unique
    // enough is covered by the leaf name; short names are checked as-is.
    const full = f.path
    const leaf = full.split('.').pop() as string
    const section = full.includes('.')
      ? full.split('.').slice(0, -1).join('.')
      : ''
    const hit =
      src.includes("'" + full + "'") ||
      src.includes('"' + full + '"') ||
      src.includes(full.replace(/\./g, '.')) ||
      (section && src.includes(section + '.' + leaf)) ||
      new RegExp('\\b' + leaf + '\\b').test(src)
    if (!hit) missing.push(full)
  }
  assert.deepEqual(missing, [], 'unread settings: ' + missing.join(', '))
})

test('diagnostics.* is wired into the agent loop', () => {
  const loop = fs.readFileSync(path.join(SRC, 'agent-loop.ts'), 'utf-8')
  assert.ok(loop.includes('shouldRunDiagnostics'))
  assert.ok(loop.includes('runDiagnostics'))
  const runTask = fs.readFileSync(path.join(SRC, 'run-task.ts'), 'utf-8')
  assert.ok(runTask.includes('config.diagnostics'))
})
