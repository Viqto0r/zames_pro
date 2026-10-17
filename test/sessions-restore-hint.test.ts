import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG } from '../src/i18n.ts'

// Regression: the `/resume <n>` command was REMOVED (only /resume-id <id>
// exists now), but the `/sessions` hint still told the operator to run
// "/resume <n> after /chats" — a dead command. The stale text survived because
// the i18n-unused guard only checks that a key is REFERENCED, not that the
// words inside it are true, and the e2e help test only scanned --help.
//
// Any operator-facing hint must not advertise a command the dispatcher does
// not handle. This test pins the hint to the LIVE `/resume-id <id>`.

test('sessions.restore_hint does not advertise the removed /resume <n>', () => {
  const entry = CATALOG['sessions.restore_hint']
  assert.ok(entry, 'sessions.restore_hint must exist')
  for (const loc of ['ru', 'en'] as const) {
    assert.ok(
      !/\/resume\s+<n>/.test(entry[loc]),
      `the ${loc} hint still advertises the removed /resume <n>: ${entry[loc]}`,
    )
    assert.ok(
      entry[loc].includes('/resume-id <id>'),
      `the ${loc} hint must point at the live /resume-id <id>`,
    )
  }
})

test('no catalog string advertises a removed command', () => {
  // A narrow blacklist: the /resume <n> form was deleted from the dispatch,
  // so no operator-facing string may mention it again.
  const offenders: string[] = []
  for (const [key, entry] of Object.entries(CATALOG)) {
    for (const loc of ['ru', 'en'] as const) {
      if (/\/resume\s+<n>/.test(entry[loc])) offenders.push(`${key} (${loc})`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'stale /resume <n> hints: ' + offenders.join(', '),
  )
})
