import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isRunnablePath,
  needsCompletionNudge,
  type RunStep,
} from '../src/completion-check.ts'

// test/completion-check.test.ts and completion-check-makefile.test.ts pin the
// main cases. The EXTENSION table and the step-sequence edges were open: a
// mixed-case path, a dot INSIDE a directory name (`dir.d/README.md` must not
// read `.md` as the extension of the file), the extension-less build files
// (case-insensitive), and a Bash call between two edits.

const edit = (path?: string, tool = 'Write'): RunStep => ({
  tool,
  mutating: true,
  path,
})
const bash: RunStep = { tool: 'Bash', mutating: false }
const read: RunStep = { tool: 'Read', mutating: false }

test('the extension table matches case-insensitively', () => {
  for (const p of [
    'a.HTML',
    'src/B.PY',
    'a.Tsx',
    'a.Sh',
    'a.RB',
    'a.Go',
    'a.RS',
    'a.Java',
    'a.PHP',
    'a.CSS',
    'a.MJS',
    'a.CJS',
    'a.HTM',
  ]) {
    assert.equal(isRunnablePath(p), true, p)
  }
})

test('a non-runnable extension is not a target', () => {
  for (const p of ['x.txt', 'a.pyw', 'a.vue', 'notes.md', 'package.json']) {
    assert.equal(isRunnablePath(p), false, p)
  }
})

test('a dot in a DIRECTORY name is not the file extension', () => {
  // `dir.d/README.md`: the last dot sits before the last slash, so the file
  // has NO extension for this purpose.
  assert.equal(isRunnablePath('dir.d/README.md'), false)
  // A dot directory AND a runnable extension still counts.
  assert.equal(isRunnablePath('dir.d/app.js'), true)
  // A dotfile has no extension either (the dot is at index 0).
  assert.equal(isRunnablePath('.bashrc'), false)
  assert.equal(isRunnablePath('.env'), false)
})

test('the extension-less build files are recognised in any case', () => {
  for (const p of [
    'Makefile',
    'makefile',
    'MAKEFILE',
    'GNUmakefile',
    'Dockerfile',
    'src/Dockerfile',
    'dockerfile',
    'Containerfile',
    'deploy/CONTAINERFILE',
    'build.ninja',
    'justfile',
  ]) {
    assert.equal(isRunnablePath(p), true, p)
  }
  assert.equal(isRunnablePath('CMakeLists.txt'), false)
})

test('the LAST runnable edit decides, and Bash in between does not count', () => {
  // Bash AFTER the last runnable edit verifies it.
  assert.equal(needsCompletionNudge([edit('a.py'), bash]), false)
  // But a NEW runnable edit after that Bash is unverified again.
  assert.equal(needsCompletionNudge([edit('a.py'), bash, edit('b.py')]), true)
  // A non-runnable edit after the verified one does not reset the check.
  assert.equal(
    needsCompletionNudge([edit('a.py'), bash, edit('README.md')]),
    false,
  )
  // Only a READ after the edit does not verify it.
  assert.equal(needsCompletionNudge([edit('a.py'), read]), true)
})

test('a mutating call is identified by its flag, not its tool name', () => {
  // A custom tool that mutates a runnable file counts.
  assert.equal(
    needsCompletionNudge([
      { tool: 'ApplyPatch', mutating: true, path: 'x.sh' },
    ]),
    true,
  )
  // A tool NAMED like a writer but flagged non-mutating does not.
  assert.equal(
    needsCompletionNudge([{ tool: 'Write', mutating: false, path: 'x.sh' }]),
    false,
  )
})
