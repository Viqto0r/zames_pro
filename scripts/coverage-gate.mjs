import { spawnSync } from 'node:child_process'

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
}

const run = spawnSync(
  'npx',
  ['tsx', '--test', '--experimental-test-coverage', 'test/*.test.ts'],
  { encoding: 'utf-8', shell: process.platform === 'win32', maxBuffer: 1024 * 1024 * 64 },
)

const out = (run.stdout || '') + (run.stderr || '')

if (run.status !== 0) {
  console.error('coverage-gate: test run failed (exit ' + run.status + ')')
  process.exit(1)
}

const linePct = new Map()
for (const line of out.split('\n')) {
  // Per-file rows look like:
  //   ℹ  commands.ts      |  94.14 |  78.70 |  93.88 | 40-56 ...
  const m = line.match(/^\s*\S?\s*([A-Za-z0-9._-]+\.ts)\s+\|\s+([\d.]+)\s+\|/)
  if (m) linePct.set(m[1], Number(m[2]))
}

const failures = []
for (const [file, floor] of Object.entries(FLOORS)) {
  const pct = linePct.get(file)
  if (pct === undefined) {
    failures.push(file + ': no coverage row found')
    continue
  }
  if (pct < floor) {
    failures.push(file + ': ' + pct + '% < floor ' + floor + '%')
  } else {
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

if (failures.length) {
  console.error('coverage-gate: FAILED')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log('coverage-gate: OK')
