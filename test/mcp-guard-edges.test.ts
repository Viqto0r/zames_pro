import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeParamsExternally,
  normalizeServerConfig,
  hardenPlaywrightArgs,
} from '../src/mcp.ts'

// test/mcp.test.ts pins the main shapes. The EDGES of the three guards were
// open: a schema whose `type` is a LIST (a zod-derived wrapper) must still be
// appended to the description, a >4000-byte schema must be DROPPED, a config
// with only blank fields is still a server, and the playwright hardener must
// keep its hands off a server that already chose a profile.

test('a schema typed as a LIST still reaches the description', () => {
  const out = describeParamsExternally('Do it', {
    type: ['object'],
    properties: { url: { type: 'string', description: 'The URL' } },
  })
  assert.match(out, /JSON Schema/)
  assert.match(out, /The URL/)
})

test('a non-object / missing / oversized schema is left out', () => {
  assert.equal(describeParamsExternally('d', { type: 'array' }), 'd')
  assert.equal(describeParamsExternally('d', null), 'd')
  assert.equal(describeParamsExternally('d', {}), 'd')
  const big = {
    type: 'object',
    properties: Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [
        'k' + i,
        { type: 'string', description: 'x'.repeat(50) },
      ]),
    ),
  }
  assert.equal(
    describeParamsExternally('d', big),
    'd',
    'a schema over the 4000-byte cap must be dropped',
  )
})

test('normalizeServerConfig stringifies env/args/headers and keeps blanks', () => {
  assert.deepEqual(
    normalizeServerConfig({
      command: 'npx',
      args: [1, 2],
      env: { A: 1, B: true },
      headers: { H: 5 },
      transport: 'streamable-http',
    }),
    {
      command: 'npx',
      args: ['1', '2'],
      env: { A: '1', B: 'true' },
      headers: { H: '5' },
      transport: 'streamable-http',
    },
  )
  // `disabled` is only honoured as a REAL boolean.
  assert.equal(
    normalizeServerConfig({ command: 'x', disabled: 'yes' })?.disabled,
    undefined,
  )
  assert.equal(
    normalizeServerConfig({ command: 'x', disabled: true })?.disabled,
    true,
  )
  // A blank command is still a command (the loader rejects it later); a
  // config with NOTHING at all is dropped.
  assert.equal(normalizeServerConfig({ command: '   ' })?.command, '   ')
  assert.equal(normalizeServerConfig({ args: ['x'] }), null)
  assert.equal(normalizeServerConfig({ url: 42 }), null)
})

test('the playwright hardener respects a profile chosen in the COMMAND', () => {
  // The profile flag sits in the command itself, not in `args`.
  assert.deepEqual(
    hardenPlaywrightArgs('npx --user-data-dir=/tmp/x', ['@playwright/mcp']),
    ['@playwright/mcp'],
  )
  // `--isolated=false` is NOT the isolated flag: the hardener must add it.
  assert.deepEqual(
    hardenPlaywrightArgs('npx', ['@playwright/mcp@latest', '--isolated=false']),
    ['@playwright/mcp@latest', '--isolated=false', '--isolated'],
  )
  // A CDP endpoint means an existing browser: nothing to isolate.
  assert.deepEqual(
    hardenPlaywrightArgs('npx', [
      '@playwright/mcp@latest',
      '--cdp-endpoint',
      'ws://x',
    ]),
    ['@playwright/mcp@latest', '--cdp-endpoint', 'ws://x'],
  )
  // A server that only MENTIONS playwright (a docs server) is not touched.
  assert.deepEqual(hardenPlaywrightArgs('node', ['playwright-docs.js']), [
    'playwright-docs.js',
  ])
})
