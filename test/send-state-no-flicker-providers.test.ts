import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The status badge must not flip to 'settled' before the next send flips it
// back to 'generating': that pair is what re-widened the status row twice per
// turn (the interface flicker). The DeepSeek pin lives in
// send-state-no-flicker.test.ts; Qwen and GLM have their OWN ask()/_waitForSendSlot
// copies, so they need the same rule.
for (const file of ['qwen-browser.ts', 'glm-browser.ts']) {
  const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')

  test(file + ': the send slot returns to generating', () => {
    const i = src.indexOf('async _waitForSendSlot')
    assert.ok(i > 0)
    const body = src.slice(i, src.indexOf('async _sleepInterruptible', i))
    assert.ok(!body.includes("_emitSendState('settled')"), body)
    assert.ok(body.includes("_emitSendState('generating')"), body)
  })

  test(file + ': ask() does not emit a transient settled', () => {
    const i = src.indexOf('async ask(')
    assert.ok(i > 0)
    const body = src.slice(i, i + 6000)
    assert.ok(!body.includes("_emitSendState('settled')"), body)
  })
}
