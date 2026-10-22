import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePermissions, decidePermission } from '../src/permissions.ts'

// `parsePermissions` copies ONLY the keys it knows (`tool`/`command`/`path`)
// and silently drops every other one. A rule written with a plural/renamed
// key (`paths`, `tools`, `cmd_regex`) therefore became a rule WITHOUT that
// condition — it matched EVERY call of the listed tools and blocked the whole
// agent, while the operator saw a policy that clearly targeted one path.
test('parsePermissions: an unknown condition key does not widen the rule', () => {
  const policy = parsePermissions({
    default: 'allow',
    rules: [{ tool: '^Write$', paths: '^/etc/', action: 'deny' }],
  })
  // A rule with an unusable condition is dropped, so the policy itself is
  // 'no policy' (default allow) and nothing is widened.
  const ok = decidePermission(policy, 'Write', { path: '/w/src/a.ts' })
  assert.equal(ok.action, 'allow')
})

test('parsePermissions: a condition-less rule is kept (matches everything)', () => {
  const policy = parsePermissions({ rules: [{ action: 'deny' }] })
  assert.ok(policy)
  assert.equal(
    decidePermission(policy, 'Bash', { command: 'ls' }).action,
    'deny',
  )
})
