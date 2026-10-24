// promptOnce() (the paste-aware raw-TTY reader for one-shot confirmations) is
// byte/UTF-16 oriented, but it accepted a chunk that ENDS in the middle of a
// surrogate pair (a read split an emoji between two `data` events, or a
// Backspace deleted one UTF-16 unit of it). The result carries a LONE
// surrogate — a broken code point — into whatever the prompt is used for
// (a login, a path, an answer).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'

async function drive(chunks: string[]): Promise<string> {
  const stdin: any = new PassThrough()
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (v: boolean): void => {
    stdin.isRaw = v
  }
  const stdout: any = new PassThrough()
  stdout.isTTY = true
  stdout.on('data', () => {})
  const realIn = process.stdin
  const realOut = process.stdout
  Object.defineProperty(process, 'stdin', {
    value: stdin,
    configurable: true,
  })
  Object.defineProperty(process, 'stdout', {
    value: stdout,
    configurable: true,
  })
  try {
    const { promptOnce } = await import('../src/prompt.ts')
    const p = promptOnce('> ')
    let t = 10
    for (const c of chunks) {
      const chunk = c
      setTimeout(() => stdin.write(chunk), t)
      t += 15
    }
    setTimeout(() => stdin.write('\r'), t)
    return await Promise.race([
      p,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 600)),
    ])
  } finally {
    Object.defineProperty(process, 'stdin', {
      value: realIn,
      configurable: true,
    })
    Object.defineProperty(process, 'stdout', {
      value: realOut,
      configurable: true,
    })
  }
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true
    }
  }
  return false
}

test('promptOnce never returns a lone surrogate after a split read', async () => {
  // The high and low halves of one emoji arrive in SEPARATE data events.
  const out = await drive(['a\ud83d', '\ude00', 'b'])
  assert.ok(!hasLoneSurrogate(out), 'lone surrogate: ' + JSON.stringify(out))
})

test('promptOnce never returns a lone surrogate after Backspace', async () => {
  // `a😀` then Backspace: one UTF-16 unit is removed, leaving half an emoji.
  const out = await drive(['a\ud83d\ude00', '\x7f'])
  assert.ok(!hasLoneSurrogate(out), 'lone surrogate: ' + JSON.stringify(out))
})
