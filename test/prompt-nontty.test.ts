import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { promptOnce } from '../src/prompt.ts'

// promptOnce has two paths. The TTY path drives a real terminal, so it is not
// testable without a pty; the NON-TTY path (a pipe, a redirect, a one-shot
// run) is pure stream handling and is pinned here: everything up to EOF is
// ONE answer and a UTF-8 character split between two chunks heals.

async function withStdin<T>(
  stdin: PassThrough,
  fn: () => Promise<T>,
): Promise<T> {
  const origStdin = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', {
    value: stdin,
    configurable: true,
  })
  try {
    return await fn()
  } finally {
    if (origStdin) Object.defineProperty(process, 'stdin', origStdin)
  }
}

test('a non-TTY stdin reads everything up to EOF as one answer', async () => {
  const stdin = new PassThrough()
  const p = withStdin(stdin, () => promptOnce('q> '))
  stdin.write('hello ')
  stdin.write('world')
  stdin.end()
  assert.equal(await p, 'hello world')
})

test('a UTF-8 character split across two chunks is decoded once', async () => {
  const stdin = new PassThrough()
  const p = withStdin(stdin, () => promptOnce('q> '))
  // 'я' is D1 8F in UTF-8: the first chunk ends mid-character.
  const buf = Buffer.from('я', 'utf8')
  stdin.write(buf.subarray(0, 1))
  stdin.write(buf.subarray(1))
  stdin.end()
  assert.equal(await p, 'я')
})

test('newlines are kept verbatim in the non-TTY path', async () => {
  const stdin = new PassThrough()
  const p = withStdin(stdin, () => promptOnce('q> '))
  stdin.write('line1\nline2\n')
  stdin.end()
  assert.equal(await p, 'line1\nline2\n')
})

test('an immediate EOF yields an empty answer', async () => {
  const stdin = new PassThrough()
  const p = withStdin(stdin, () => promptOnce('q> '))
  stdin.end()
  assert.equal(await p, '')
})
