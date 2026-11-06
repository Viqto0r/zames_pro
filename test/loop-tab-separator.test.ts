import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseInterval } from '../src/scheduler.ts'

// `/loop` splits the rest on a literal SPACE (`rest.indexOf(' ')`). A TAB
// between the interval and the task makes the WHOLE rest the "interval",
// parseInterval rejects it and the operator gets a typo message quoting the
// entire task instead of a scheduled job.

const TAB = String.fromCharCode(9)

function loopSplit(rest: string): { interval: string; task: string } {
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest.trim())
  return { interval: m?.[1] ?? '', task: (m?.[2] ?? '').trim() }
}

test('a tab after the interval still yields the task', () => {
  const { interval, task } = loopSplit('5m' + TAB + 'run the tests')
  assert.equal(interval, '5m')
  assert.equal(task, 'run the tests')
  assert.equal(parseInterval(interval), 300_000)
})

test('a plain space keeps working', () => {
  const { interval, task } = loopSplit('5m run the tests')
  assert.equal(interval, '5m')
  assert.equal(task, 'run the tests')
})

test('the source splits on any whitespace', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const src = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf-8')
  const body = src.slice(src.indexOf('const loopCommand'))
  assert.doesNotMatch(
    body.slice(0, 800),
    /^\s*const sp = rest\.indexOf/m,
    '/loop still splits on a literal space only',
  )
})
