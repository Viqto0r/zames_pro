// askPassword() reads a password one UTF-16 unit at a time. Backspace removed
// ONE unit, so an emoji (two units) lost half of itself and the returned
// password carried a LONE surrogate — a broken code point sent to the login
// form (the password then simply did not match).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'

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

test('askPassword: Backspace does not leave half an emoji', async () => {
  const stdin: any = new PassThrough()
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (v: boolean): void => {
    stdin.isRaw = v
  }
  stdin.pause = (): void => {}
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
    const { askPassword } = await import('../src/browser-pure.ts')
    const p = askPassword('pw: ')
    setTimeout(() => stdin.write('a\ud83d\ude00'), 10)
    setTimeout(() => stdin.write('\x7f'), 25)
    setTimeout(() => stdin.write('\r'), 40)
    const out = await Promise.race([
      p,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 600)),
    ])
    assert.ok(!hasLoneSurrogate(out), 'lone surrogate: ' + JSON.stringify(out))
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
})
