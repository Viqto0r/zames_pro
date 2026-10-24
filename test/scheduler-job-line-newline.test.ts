// formatJobLine() renders one /jobs row. The job TASK and the CRON expression
// are operator text (`/loop 5m <task>`, `/cron "<expr>" <task>`) and were
// printed VERBATIM: a newline in either starts a new terminal line and can
// fake another row of the report (`[OK]  git  repo`). One job must stay on one
// line.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatJobLine } from '../src/scheduler.ts'

const now = 1_000_000

test('a multi-line task cannot fake a /jobs line', () => {
  const line = formatJobLine(
    {
      id: 1,
      kind: 'loop',
      task: 'x\n[OK]  git  repo',
      intervalMs: 60_000,
      nextAt: now,
      createdAt: now,
    } as never,
    now,
  )
  assert.equal(line.includes('\n'), false, JSON.stringify(line))
  assert.ok(line.includes('[OK] git repo'), line)
})

test('a multi-line cron expression cannot fake a line either', () => {
  const line = formatJobLine(
    {
      id: 2,
      kind: 'cron',
      task: 't',
      cron: '0 9 * * *\nFAKE',
      nextAt: now,
      createdAt: now,
    } as never,
    now,
  )
  assert.equal(line.includes('\n'), false, JSON.stringify(line))
})

test('an ordinary job renders as before', () => {
  const line = formatJobLine(
    {
      id: 3,
      kind: 'loop',
      task: 'run tests',
      intervalMs: 60_000,
      nextAt: now,
      createdAt: now,
    } as never,
    now,
  )
  assert.ok(line.includes('] run tests'), line)
})
