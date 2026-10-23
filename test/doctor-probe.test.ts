import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doctorProbeSummary } from '../src/status-command.js'

test('doctorProbeSummary: no git / no auth / no MCP are all warns', () => {
  const rows = doctorProbeSummary({
    gitOk: false,
    gitBranch: null,
    mcpServers: 0,
    mcpTools: 0,
    authSaved: false,
  })
  assert.deepEqual(
    rows.map((r) => r.status),
    ['warn', 'warn', 'warn'],
  )
  assert.match(rows[0].label, /absent/)
  assert.match(rows[1].label, /not saved/)
})

test('doctorProbeSummary: a detached HEAD does not print null', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: null,
    mcpServers: 0,
    mcpTools: 0,
    authSaved: true,
  })
  assert.match(rows[0].label, /detached/)
  assert.ok(!/null/.test(rows[0].label))
})

test('doctorProbeSummary: a saved marker and MCP tools are OK', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'master',
    mcpServers: 2,
    mcpTools: 7,
    authSaved: true,
  })
  assert.deepEqual(
    rows.map((r) => r.status),
    ['ok', 'ok', 'ok'],
  )
  assert.match(rows[2].label, /2 servers \/ 7 tools/)
})

test('doctorProbeSummary: a missing CRITICAL UI capability adds a warn', () => {
  const rows = doctorProbeSummary({
    gitOk: true,
    gitBranch: 'master',
    mcpServers: 0,
    mcpTools: 0,
    authSaved: true,
    uiMissingCritical: ['input', 'send'],
  })
  const last = rows[rows.length - 1]
  assert.equal(last.status, 'warn')
  assert.match(last.label, /input, send/)
})
