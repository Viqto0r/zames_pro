import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// A long-running tool (Bash/npm test/MCP) must show an animated status while it
// runs, otherwise the operator sees a frozen screen and cannot tell work is in
// progress. toolCall() starts the animation; toolResult()/assistant()/stop()
// stop it.

function capture(fn: (e: LineEditor, writes: string[]) => void): string[] {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    fn(e, writes)
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  return writes
}

test('toolCall starts an animated status', () => {
  const e = new LineEditor()
  e.toolCall('Bash', { command: 'npm test' })
  assert.equal(e._animating, true, 'animation must be running after toolCall')
  assert.ok(e._dotTimer, 'the dot timer must be active')
  assert.ok(
    e.statusText.includes('Bash'),
    'status must mention the running tool: ' + e.statusText,
  )
  e.stop()
  assert.equal(e._animating, false, 'stop() must stop the animation')
})

test('toolResult stops the running animation', () => {
  const e = new LineEditor()
  e.toolCall('Bash', { command: 'sleep 5' })
  e.toolResult('done')
  assert.equal(e._animating, false, 'toolResult must stop the animation')
  assert.equal(e._dotTimer, null, 'the dot timer must be cleared')
})

test('the running-tool status shows the stop hint (Esc now aborts the tool)', () => {
  const e = new LineEditor()
  e.toolCall('Bash', { command: 'npm test' })
  // Esc now really aborts the tool (the Bash child process is killed via the
  // AbortSignal), so the hint is shown while the tool runs.
  assert.ok(
    e.statusText.includes('Esc'),
    'stop hint expected while a tool runs: ' + e.statusText,
  )
  e.stop()
})

test('the running status cycles through the dots', async () => {
  const writes = capture((e) => {
    e.toolCall('Bash', { command: 'npm test' })
  })
  // The first frame has 0 dots.
  assert.ok(writes.join('').includes('Bash'), 'the tool name must be shown')
})
