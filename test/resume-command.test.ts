import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseResumeId,
  filterSessions,
  resumeProviderRefusal,
} from '../src/resume-command.js'
import { translate } from '../src/i18n.js'
import type { Session } from '../src/types.js'

const t = translate('en')

function s(p: Partial<Session>): Session {
  return {
    id: p.id || 'id',
    title: p.title || '',
    workdir: p.workdir || '',
    createdAt: '',
    updatedAt: '',
    provider: p.provider,
  } as Session
}

test('parseResumeId: trims, and an empty argument is null', () => {
  assert.equal(parseResumeId(' abc '), 'abc')
  assert.equal(parseResumeId(''), null)
  assert.equal(parseResumeId('   '), null)
  assert.equal(parseResumeId(undefined as unknown as string), null)
})

test('filterSessions: an empty filter returns a COPY of all', () => {
  const all = [s({ id: 'a' }), s({ id: 'b' })]
  const out = filterSessions(all, '')
  assert.deepEqual(
    out.map((x) => x.id),
    ['a', 'b'],
  )
  assert.notEqual(out, all)
})

test('filterSessions: matches title OR workdir, case-insensitively', () => {
  const all = [
    s({ id: 'a', title: 'Fix the TUI', workdir: '/p/one' }),
    s({ id: 'b', title: 'Refactor', workdir: '/p/Zames' }),
    s({ id: 'c', title: 'Other', workdir: '/q' }),
  ]
  assert.deepEqual(
    filterSessions(all, 'tui').map((x) => x.id),
    ['a'],
  )
  assert.deepEqual(
    filterSessions(all, 'ZAMES').map((x) => x.id),
    ['b'],
  )
  assert.deepEqual(filterSessions(all, 'nope'), [])
})

test('resumeProviderRefusal: same provider is allowed', () => {
  assert.equal(resumeProviderRefusal(s({ provider: 'qwen' }), 'qwen', t), null)
})

test('resumeProviderRefusal: an OLD file without provider belongs to deepseek', () => {
  assert.equal(resumeProviderRefusal(s({}), 'deepseek', t), null)
  const m = resumeProviderRefusal(s({}), 'qwen', t)
  assert.ok(m && /deepseek/.test(m))
})

test('resumeProviderRefusal: a foreign provider is refused with both ids', () => {
  const m = resumeProviderRefusal(s({ provider: 'glm' }), 'qwen', t)
  assert.ok(m)
  assert.match(m!, /glm/)
  assert.match(m!, /qwen/)
})

test('resumeProviderRefusal: a null session is not an error', () => {
  assert.equal(resumeProviderRefusal(null, 'qwen', t), null)
})
