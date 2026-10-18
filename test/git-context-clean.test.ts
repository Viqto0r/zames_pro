import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatGitContext, getGitContext } from '../src/gitTools.ts'

// `getGitContext` collects the `git status --porcelain` preview into the
// system-prompt. The shared git runner answers an EMPTY successful run with
// the sentinel `(command produced no output)`, and the preview was stored
// verbatim: a CLEAN tree therefore produced
//
//   - Uncommitted changes: 1 file(s)
//   ```
//   (command produced no output)
//   ```
//
// i.e. the model was told the working tree has a modified file and the
// "file" is an internal sentinel string. Every task then started with a
// false dirty-tree premise.

const SENTINEL = '(command produced no output)'

test('formatGitContext: a sentinel preview is not counted as a change', () => {
  const out = formatGitContext({
    branch: 'master',
    changedFiles: 1,
    statusPreview: SENTINEL,
    hasOrigin: false,
    ahead: 0,
    behind: 0,
  })
  assert.ok(!out.includes(SENTINEL), out)
  assert.ok(!/Uncommitted changes/.test(out), out)
  assert.match(out, /Working tree: clean/)
})

test('formatGitContext: a whitespace-wrapped sentinel is clean too', () => {
  const out = formatGitContext({
    branch: 'main',
    changedFiles: 1,
    statusPreview: '  ' + SENTINEL + '  ',
    hasOrigin: false,
    ahead: 0,
    behind: 0,
  })
  assert.ok(!out.includes(SENTINEL), out)
})

test('formatGitContext: a real status preview is still shown', () => {
  const out = formatGitContext({
    branch: 'main',
    changedFiles: 2,
    statusPreview: ' M src/a.ts\n?? b.ts',
    hasOrigin: false,
    ahead: 0,
    behind: 0,
  })
  assert.match(out, /Uncommitted changes: 2 file\(s\)/)
  assert.match(out, /src\/a\.ts/)
})

test('getGitContext: a clean repository has zero changed files', async () => {
  const ctx = await getGitContext(process.cwd())
  assert.ok(ctx, 'cwd should be a git repository in the test run')
  assert.ok(
    !ctx!.statusPreview.includes(SENTINEL),
    'the preview must not carry the runner sentinel: ' + ctx!.statusPreview,
  )
})
