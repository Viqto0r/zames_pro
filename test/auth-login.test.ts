import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser, sanitizeHeadlessUA } from '../src/browser.ts'

// A tiny fake Locator/Page that records calls, so the login helpers can be
// exercised without a real browser or network (fresh profiles get 403 from
// CloudFront, so a live login-page test is not possible here).
type Call = { sel: string; method: string; args: unknown[] }

class FakeLocator {
  calls: Call[]
  sel: string
  nthIndex: number | null
  constructor(calls: Call[], sel: string, nthIndex: number | null = null) {
    this.calls = calls
    this.sel = sel
    this.nthIndex = nthIndex
  }
  last() { return this }
  first() { return this }
  nth(i: number) { return new FakeLocator(this.calls, this.sel, i) }
  filter() { return this }
  async waitFor(opts?: unknown) {
    this.calls.push({ sel: this.sel, method: 'waitFor', args: [opts] })
    // Only the password field is "visible" in this fake page.
    if (!this.sel.includes('password')) throw new Error('not visible')
  }
  async isVisible() { return this.sel.includes('password') }
  async count() { return this.sel.includes('password') ? 1 : 0 }
  async click() { this.calls.push({ sel: this.sel, method: 'click', args: [] }) }
  async press(k: string) { this.calls.push({ sel: this.sel, method: 'press', args: [k] }) }
  async evaluate(fn: unknown, arg?: unknown) {
    this.calls.push({ sel: this.sel, method: 'evaluate', args: [arg] })
    return 'textarea'
  }
  async fill() { this.calls.push({ sel: this.sel, method: 'fill', args: [] }) }
}

class FakePage {
  calls: Call[] = []
  closed = false
  locator(sel: string) { return new FakeLocator(this.calls, sel) }
  // Return index 0 so _fillLoginForm's "nearest text input" fallback finds a
  // login field (the real method evaluates the input index in the DOM).
  async evaluate() { return 0 }
  async waitForTimeout() {}
  async goto() {}
  keyboard = { press: async () => {}, insertText: async () => {} }
  url() { return 'https://chat.deepseek.com/' }
}

function makeBrowser(): { b: DeepSeekBrowser; page: FakePage } {
  const b = new DeepSeekBrowser({ auth: { username: 'u', password: 'p' } })
  const page = new FakePage()
  // Inject the fake page (the real one is created in launch()).
  ;(b as unknown as { page: FakePage }).page = page
  return { b, page }
}

test('_loginFormVisible: true when a password field is visible', async () => {
  const { b } = makeBrowser()
  assert.equal(await b._loginFormVisible(), true)
})

test('_fillLoginForm: fills login+password and submits (returns true)', async () => {
  const { b, page } = makeBrowser()
  const ok = await b._fillLoginForm('user@example.com', 'secret')
  assert.equal(ok, true)
  const methods = page.calls.map((c) => c.method)
  // The password field must be filled and the form submitted.
  assert.ok(methods.includes('fill'), 'expected a fill on the inputs')
  assert.ok(
    methods.includes('click') || methods.includes('press'),
    'expected submit via click or Enter',
  )
})

test('_fillLoginForm: false when the password field is absent', async () => {
  const { b, page } = makeBrowser()
  // No input is visible: every selector throws on waitFor and reports hidden.
  ;(page as unknown as { locator: (s: string) => FakeLocator }).locator = (s) => {
    const loc = new FakeLocator(page.calls, s + '-missing')
    loc.isVisible = async () => false
    loc.count = async () => 0
    loc.waitFor = async () => {
      throw new Error('not visible')
    }
    return loc
  }
  const ok = await b._fillLoginForm('u', 'p')
  assert.equal(ok, false)
})

test('auth defaults: empty credentials, saveSession on', () => {
  const b = new DeepSeekBrowser()
  assert.equal(b.auth.username, '')
  assert.equal(b.auth.password, '')
  assert.equal(b.auth.saveSession, true)
})

test('askPassword: echoes * per char and reads raw input', async () => {
  const { askPassword } = await import('../src/browser.ts')
  const { EventEmitter } = await import('node:events')

  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (v: boolean) => void
    resume: () => void
    pause: () => void
  }
  ;(stdin as unknown as { isTTY: boolean }).isTTY = true
  ;(stdin as unknown as { isRaw: boolean }).isRaw = false
  ;(stdin as unknown as { setRawMode: (v: boolean) => void }).setRawMode = (v) => {
    ;(stdin as unknown as { isRaw: boolean }).isRaw = v
  }
  ;(stdin as unknown as { resume: () => void }).resume = () => {}
  ;(stdin as unknown as { pause: () => void }).pause = () => {}

  const origIn = process.stdin
  let out = ''
  const origWrite = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    out += s
    return true
  }
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true })

  try {
    const p = askPassword('Pass: ')
    stdin.emit('data', Buffer.from('a'))
    stdin.emit('data', Buffer.from('b'))
    stdin.emit('data', Buffer.from('\x7f')) // backspace removes 'b'
    stdin.emit('data', Buffer.from('c'))
    stdin.emit('data', Buffer.from('\r')) // Enter
    const val = await p
    assert.equal(val, 'ac')
    assert.ok(out.includes('Pass: '))
    // Three '*' were printed (a, b, c); the backspace emitted an erase
    // sequence that visually removes one of them. Crucially, the cleartext
    // is never written.
    assert.equal((out.match(/\*/g) || []).length, 3)
    assert.ok(out.includes('\b \b'))
    assert.ok(!out.includes('ab'))
  } finally {
    Object.defineProperty(process, 'stdin', { value: origIn, configurable: true })
    ;(process.stdout as unknown as { write: typeof origWrite }).write = origWrite
  }
})

test('sanitizeHeadlessUA: drops the Headless marker, keeps the version', () => {
  const ua =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36'
  const fixed = sanitizeHeadlessUA(ua)
  assert.equal(
    fixed,
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36',
  )
  assert.ok(!/Headless/i.test(fixed))
  // A normal UA is returned unchanged.
  const normal =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
  assert.equal(sanitizeHeadlessUA(normal), normal)
  // Empty input does not throw.
  assert.equal(sanitizeHeadlessUA(''), '')
})

test('userAgent: an explicit UA is sanitized, headless derives it later', () => {
  const b = new DeepSeekBrowser({
    headless: true,
    userAgent:
      'Mozilla/5.0 HeadlessChrome/153.0.8010.12 Safari/537.36',
  })
  assert.equal(b.userAgent, 'Mozilla/5.0 Chrome/153.0.8010.12 Safari/537.36')
  // No explicit UA: nothing is set in the constructor (it is derived from the
  // real engine UA after launch).
  const b2 = new DeepSeekBrowser({ headless: true })
  assert.equal(b2.userAgent, '')
})
