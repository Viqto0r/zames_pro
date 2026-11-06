import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoverFromContextLimit } from '../src/context-limit.ts'
import { translate } from '../src/i18n.ts'

// The recovery notices are shown ABOVE the live input line. The compaction
// ERROR message is interpolated into a sentence
// (`⚠ Could not compact the history: {error}`), and a provider/JS error can
// carry a newline (a stack, a multi-line server message) — the notice then
// spread over several rows of the live UI and pushed the input panel down.
// Every other report row flattens its values first.

const NL = String.fromCharCode(10)

async function notices(provider: string, err?: string): Promise<string[]> {
  const out: string[] = []
  await recoverFromContextLimit(
    {
      recover: async () => {
        if (err !== undefined) throw new Error(err)
        return true
      },
      maxRetries: 3,
      attempt: 1,
      notice: (s) => out.push(s),
      t: translate('en'),
      keys: {
        compact: 'ds.context_limit_compact',
        compactFailed: 'ds.context_limit_compact_failed',
        giveUp: 'ds.context_limit_give_up',
      },
      provider,
    },
    new Error('orig'),
  )
  return out
}

test('a multi-line compaction error stays on one notice row', async () => {
  for (const n of await notices('DeepSeek', 'line 1' + NL + 'line 2'))
    assert.equal(n.includes(NL), false, JSON.stringify(n))
})

test('a newline in the provider label stays on one row', async () => {
  for (const n of await notices('Deep' + NL + 'Seek'))
    assert.equal(n.includes(NL), false, JSON.stringify(n))
})
