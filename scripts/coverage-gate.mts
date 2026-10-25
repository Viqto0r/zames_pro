import { spawnSync } from 'node:child_process'
import { parseCoverageRows, runCoverageGate } from './coverage-gate-lib.mts'

// Soft coverage FLOOR for the PURE logic modules — the ones a regression would
// silently break without any UI symptom (command formatting, schedule parsing,
// the raw SSE/model-answer parsing). The floors are deliberately a few points
// BELOW the current values so ordinary churn does not fail the build; they
// only catch a real drop (a module losing its tests).
//
// Node's test runner has no built-in coverage threshold, so we parse the
// per-file line % from the coverage report it prints and compare here. This is
// informational in the sense that the FLOORS are conservative, but a drop
// below one is a hard failure.
const FLOORS = {
  'commands.ts': 85,
  'scheduler.ts': 90,
  'net-capture.ts': 90,
  'xml-toolcall.ts': 90,
  'diff.ts': 90,
  'theme.ts': 95,
  // Added later: core logic or already well-tested, so a silent regression
  // that deletes their tests should be caught too. Floors sit a few points
  // below the current values.
  'extraTools.ts': 85,
  'fsutil.ts': 90,
  'sessions.ts': 90,
  'context.ts': 85,
  'markdown.ts': 90,
  'tools.ts': 90,
  'system-prompt.ts': 90,
  'undo.ts': 85,
  'checkpoint.ts': 80,
  'permissions.ts': 85,
  // changelog.ts is mostly comments + type/interface declarations (lines
  // 1-30) that carry no runtime statements, so its LINE % caps well below the
  // other modules even with every executable branch tested. The floor reflects
  // that ceiling (a real drop below it still fails).
  'changelog.ts': 78,
  'attach-refs.ts': 85,
  // The pure /config subcommand dispatcher — silent routing regressions
  // (a wrong subcommand branch) are invisible without tests.
  'config-command.ts': 85,
  // The Ink TUI's PURE halves: the editor state transitions (tui/edit.ts) and
  // the key dispatcher (tui/keys.ts). A silent regression there breaks the
  // operator's editing without any UI test catching it. NOTE: the gate keys on
  // the BASENAME (its regex has no slash), so these are 'edit.ts' / 'keys.ts' /
  // 'store.ts' — unique in the tree today.
  'edit.ts': 85,
  'keys.ts': 85,
  'store.ts': 85,
  'banner.ts': 85,
  'tool-summary.ts': 85,
  // web.ts holds the SSRF guard and the DuckDuckGo/HTML parsers — a
  // regression there is silent. Floors sit below the current values.
  'web.ts': 40,
  'spinner.ts': 55,
}

const run = spawnSync(
  'npx',
  ['tsx', '--test', '--experimental-test-coverage', 'test/*.test.ts'],
  {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    maxBuffer: 1024 * 1024 * 64,
  },
)

const out = (run.stdout || '') + (run.stderr || '')

if (run.status !== 0) {
  console.error('coverage-gate: test run failed (exit ' + run.status + ')')
  process.exit(1)
}

const linePct = parseCoverageRows(out)

const gate = runCoverageGate(linePct, FLOORS)
for (const [file, floor] of Object.entries(FLOORS)) {
  const pct = linePct.get(file)
  if (pct !== undefined && pct >= floor) {
    console.log('coverage-gate: ' + file + ' ' + pct + '% >= ' + floor + '%')
  }
}
// Print the lowest-covered modules, so a dead or untested module is visible
// in the CI log even when it has no floor yet. Informational only.
const sorted = [...linePct.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8)
if (sorted.length) {
  console.log('coverage-gate: lowest covered modules (informational):')
  for (const [name, pct] of sorted) {
    console.log('  ' + name + ' ' + pct + '%')
  }
}

if (!gate.ok) {
  console.error('coverage-gate: FAILED')
  for (const f of gate.failures) {
    console.error('  ' + f.file + ': ' + f.reason)
  }
  process.exit(1)
}
console.log('coverage-gate: OK')
