import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from '../src/web.ts'

// N12: web.ts holds the SSRF guard and the DuckDuckGo parser but was barely
// covered. These pin the pure htmlToText heuristics (script/style stripping,
// link rewriting, entities, whitespace collapse).

test('htmlToText strips script/style/noscript/svg and comments', () => {
  const out = htmlToText(
    '<div>ok<script>x=1</script><style>a{}</style>' +
      '<noscript>n</noscript><svg><path/></svg><!-- c --></div>',
  )
  assert.ok(out.includes('ok'))
  assert.ok(!out.includes('x=1'))
  assert.ok(!out.includes('a{}'))
  assert.ok(!out.includes('n'))
})

test('htmlToText rewrites anchors to text (url)', () => {
  const out = htmlToText('<a href="https://e.com">Site</a>')
  assert.equal(out, 'Site (https://e.com)')
})

test('htmlToText keeps a bare href when the anchor text is empty', () => {
  const out = htmlToText('<a href="https://e.com"></a>')
  assert.equal(out, 'https://e.com')
})

test('htmlToText decodes named and numeric entities', () => {
  const out = htmlToText(
    'a&amp;b&nbsp;c&lt;d&gt;e&quot;f&#39;g&mdash;h&ndash;i&hellip;j&#65;&#x42;',
  )
  assert.ok(out.includes('a&b c<d>e"f\'g'))
  assert.ok(out.includes('—'))
  assert.ok(out.includes('…'))
  assert.ok(out.includes('AB'))
})

test('htmlToText collapses blank lines and trims spaces', () => {
  const out = htmlToText('<p>a</p><p></p><p>b</p>')
  assert.equal(out, 'a\nb')
})

test('htmlToText turns list items into dashes', () => {
  const out = htmlToText('<ul><li>one</li><li>two</li></ul>')
  assert.ok(out.includes('- one'))
  assert.ok(out.includes('- two'))
})

// N12: the DuckDuckGo result parser (uddg unwrap, snippet, dedup by regex) is
// pure and was previously untested (a format change would go unnoticed).
import { parseDuckDuckGoResults } from '../src/web.ts'

test('parseDuckDuckGoResults unwraps the uddg redirect', () => {
  const html =
    '<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fx">Example</a>' +
    '<a class="result__snippet">A snippet</a>'
  const out = parseDuckDuckGoResults(html, 10)
  assert.equal(out.length, 1)
  assert.equal(out[0].url, 'https://example.com/x')
  assert.equal(out[0].title, 'Example')
  assert.equal(out[0].snippet, 'A snippet')
})

test('parseDuckDuckGoResults respects the limit', () => {
  const one =
    '<a class="result__a" href="https://a.com">A</a><a class="result__snippet">s</a>'
  const out = parseDuckDuckGoResults(one.repeat(10), 3)
  assert.equal(out.length, 3)
})

test('parseDuckDuckGoResults skips entries with no title', () => {
  const html = '<a class="result__a" href="https://a.com"></a>'
  assert.equal(parseDuckDuckGoResults(html, 5).length, 0)
})

// N15: the headless render context is created ONCE and reused; a single pure
// factory backs that cache so the reuse/reset behaviour is testable without a
// browser.
import { createReusable } from '../src/web.ts'

test('createReusable builds the value once and reuses it', async () => {
  let made = 0
  const r = createReusable(
    async () => {
      made++
      return { id: made }
    },
    async () => {},
  )
  const a = await r.get()
  const b = await r.get()
  assert.equal(made, 1)
  assert.equal(a, b)
})

test('createReusable.reset disposes and rebuilds on the next get', async () => {
  let made = 0
  let disposed = 0
  const r = createReusable(
    async () => {
      made++
      return { id: made }
    },
    async () => {
      disposed++
    },
  )
  await r.get()
  await r.reset()
  assert.equal(disposed, 1)
  const c = await r.get()
  assert.equal(made, 2)
  assert.equal(c.id, 2)
})

test('createReusable.reset without a value is a no-op', async () => {
  let disposed = 0
  const r = createReusable(
    async () => 1,
    async () => {
      disposed++
    },
  )
  await r.reset()
  assert.equal(disposed, 0)
})
