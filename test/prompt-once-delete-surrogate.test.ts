// The forward-Delete key ([3~) removes the character AFTER the cursor. The
// BACKSPACE path already learned to delete a whole code point (see
// prompt-once-surrogate.test.ts), but Delete still removed ONE UTF-16 unit:
// pressing Delete in front of an emoji left its low surrogate alone in the
// line, and the caller received a broken code point as the answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'

async function driveBytes(chunks: Buffer[]): Promise<string> {
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
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true })
  Object.defineProperty(process, 'stdout', {
    value: stdout,
    configurable: true,
  })
  try {
    const { promptOnce } = await import('../src/prompt.ts')
    const p = promptOnce('> ')
    for (const chunk of chunks) {
      stdin.write(chunk)
      await new Promise((r) => setImmediate(r))
    }
    stdin.write('\r')
    return await Promise.race([
      p,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 800)),
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

test('Delete removes a whole code point, not half an emoji', async () => {
  // `a` + Left + Delete on `a😀b`: the emoji must go ENTIRELY.
  const bytes = Buffer.from('a\u{1f600}b\x1b[D\x1b[D\x1b[3~', 'utf8')
  const out = await driveBytes([bytes])
  assert.equal(out, 'ab', 'delete: ' + JSON.stringify(out))
  assert.ok(!hasLoneSurrogate(out), 'lone surrogate: ' + JSON.stringify(out))
})
