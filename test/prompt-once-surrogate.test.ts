// promptOnce() (the paste-aware raw-TTY reader for one-shot confirmations) reads
// UTF-8 BYTES, and a pty can split a multi-byte character between two `data`
// events. Decoding each read on its own turned both halves into U+FFFD, so an
// emoji, a Cyrillic letter or any other non-ASCII character in the answer (a
// login, a path, a task) arrived corrupted. The reader now keeps an incomplete
// trailing sequence in a StringDecoder until the rest of its bytes arrive.
//
// The tests below pin BOTH halves of the contract: a character split between
// reads is reassembled, and Backspace still deletes a whole code point instead
// of leaving half of one.
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
    for (const chunk of chunks) {
      stdin.write(chunk)
      // Let the reader consume the read before the next one arrives, so the
      // character really IS split between two `data` events.
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

// U+FFFD is what a split byte sequence decodes to: seeing one means the reader
// decoded the halves of a character SEPARATELY instead of reassembling them.
function hasReplacementChar(s: string): boolean {
  return s.includes('\ufffd')
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

test('promptOnce reassembles a character split between reads', async () => {
  // The four bytes of one emoji arrive in TWO reads - a real pty does this.
  const bytes = Buffer.from('a\ud83d\ude00b', 'utf8')
  const out = await driveBytes([bytes.subarray(0, 2), bytes.subarray(2)])
  assert.equal(out, 'a\ud83d\ude00b', 'split read: ' + JSON.stringify(out))
  assert.ok(
    !hasReplacementChar(out),
    'replacement char: ' + JSON.stringify(out),
  )
})

test('promptOnce reassembles a Cyrillic letter split between reads', async () => {
  // One Cyrillic letter is TWO bytes: the first read carries only the lead
  // byte, the second the continuation. The operator's answer is a Russian
  // word, and a lost letter changes it.
  const bytes = Buffer.from('\u044b', 'utf8')
  const out = await driveBytes([bytes.subarray(0, 1), bytes.subarray(1)])
  assert.equal(out, '\u044b', 'split read: ' + JSON.stringify(out))
})

test('promptOnce never returns a lone surrogate after Backspace', async () => {
  // `a` + emoji + Backspace: a whole code point must go, not half of one.
  const bytes = Buffer.from('a\ud83d\ude00\x7f', 'utf8')
  const out = await driveBytes([bytes])
  assert.equal(out, 'a', 'backspace: ' + JSON.stringify(out))
  assert.ok(!hasLoneSurrogate(out), 'lone surrogate: ' + JSON.stringify(out))
})
