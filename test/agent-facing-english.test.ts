import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Enforces the AGENTS.md language policy: agent-facing files (tool
// descriptions, tool-result strings, the system prompt, MCP tool descriptions)
// must be ENGLISH and contain no Cyrillic. Operator-facing text goes through
// src/i18n.ts instead. A stray Russian prose string here would leak into the
// model's context (and the tool contract the model relies on).
const AGENT_FACING = [
  'src/tools.ts',
  'src/extraTools.ts',
  'src/gitTools.ts',
  'src/web.ts',
  'src/system-prompt.ts',
  'src/mcp.ts',
]

const CYRILLIC = /[\u0400-\u04FF]/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('agent-facing modules contain no Cyrillic', () => {
  const offenders: string[] = []
  for (const rel of AGENT_FACING) {
    const body = fs.readFileSync(path.join(root, rel), 'utf-8')
    body.split('\n').forEach((line, i) => {
      if (CYRILLIC.test(line)) offenders.push(rel + ':' + (i + 1))
    })
  }
  assert.deepEqual(
    offenders,
    [],
    'Cyrillic found in agent-facing files: ' + offenders.join(', '),
  )
})
