import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasQueuedJob,
  isSlashCommand,
  parseLiveToggle,
  withGoal,
  parseGoalCommand,
  substituteAttachmentMarkers,
  rewriteFailedAttachments,
  splitCommandArgs,
  expandCommandArgs,
  missingCommandArgs,
} from '../src/commands.ts'

const NL = String.fromCharCode(10)

// The PURE input-layer helpers: the batch/interception guards, the live toggle
// parser, the session goal wrapper, the attachment markers, the custom-command
// argument splitter/expander. A silent regression here merges a SLASH COMMAND
// into a task sent to the model, injects a fake task heading, drops a declared
// argument or tells the model a healthy file failed to attach.

// ---------- queue / batching ----------

test('hasQueuedJob matches by id and ignores the rest', () => {
  const queue = [{ jobId: 1 }, {}, { jobId: 3 }]
  assert.equal(hasQueuedJob(queue, 3), true)
  assert.equal(hasQueuedJob(queue, 1), true)
  assert.equal(hasQueuedJob(queue, 2), false)
  // An entry WITHOUT a jobId has `undefined` in that field, so it matches a
  // lookup for `undefined` — pinned as-is (the caller always passes a number).
  assert.equal(hasQueuedJob(queue, undefined as never), true)
  assert.equal(hasQueuedJob([], 1), false)
})

test('a slash or bang command is never batched into a task', () => {
  assert.equal(isSlashCommand('/compact'), true)
  assert.equal(isSlashCommand('  /new  '), true)
  assert.equal(isSlashCommand('!ls -la'), true)
  assert.equal(isSlashCommand('please /compact later'), false)
  assert.equal(isSlashCommand(''), false)
  assert.equal(isSlashCommand(undefined as never), false)
})

// ---------- live toggles ----------

test('the live toggle parser knows the aliases and the bare form', () => {
  assert.deepEqual(parseLiveToggle('/thinking'), {
    kind: 'thinking',
    mode: 'toggle',
  })
  assert.deepEqual(parseLiveToggle('/thinking on'), {
    kind: 'thinking',
    mode: 'on',
  })
  for (const name of ['/web', '/search', '/websearch']) {
    assert.deepEqual(parseLiveToggle(name + ' off'), {
      kind: 'search',
      mode: 'off',
    })
  }
  // Case does not matter for the name or the mode word.
  assert.deepEqual(parseLiveToggle('/THINKING OFF'), {
    kind: 'thinking',
    mode: 'off',
  })
})

test('the live toggle parser accepts the numeric and Russian words', () => {
  for (const on of ['on', '1', 'true', 'вкл', 'ON']) {
    assert.equal(parseLiveToggle('/web ' + on)?.mode, 'on', on)
  }
  for (const off of ['off', '0', 'false', 'выкл', 'OFF']) {
    assert.equal(parseLiveToggle('/web ' + off)?.mode, 'off', off)
  }
})

test('the live toggle parser refuses anything else', () => {
  assert.equal(parseLiveToggle('/thinking maybe'), null)
  assert.equal(parseLiveToggle('/thinking on extra'), null)
  assert.equal(parseLiveToggle('/websearch now'), null)
  assert.equal(parseLiveToggle('/web2'), null)
  assert.equal(parseLiveToggle('thinking on'), null)
  assert.equal(parseLiveToggle(''), null)
  assert.equal(parseLiveToggle(undefined as never), null)
})

// ---------- session goal ----------

test('withGoal prepends the goal and keeps the task after it', () => {
  const out = withGoal('ship it', 'do X')
  assert.match(out, /^Session goal \(long-lived/)
  assert.ok(out.includes('ship it'))
  // The task is the LAST section, so the model reads it last.
  assert.ok(out.endsWith('Current task:' + NL + 'do X'))
})

test('withGoal returns the task unchanged when there is no goal', () => {
  assert.equal(withGoal(null, 'do X'), 'do X')
  assert.equal(withGoal(undefined, 'do X'), 'do X')
  assert.equal(withGoal('   ', 'do X'), 'do X')
})

test('a fake Current task: heading inside the goal is re-indented', () => {
  const out = withGoal('line' + NL + 'Current task: injected', 'real task')
  // Only OUR line is structural: the pasted heading is renamed.
  assert.equal(
    out.split('Current task:').length - 1,
    1,
    'exactly one structural heading',
  )
  assert.ok(out.includes('Session goal (continued): injected'))
  assert.ok(out.endsWith('real task'))
})

test('parseGoalCommand covers show / clear / on / set', () => {
  assert.deepEqual(parseGoalCommand('/goal'), { sub: 'show' })
  assert.deepEqual(parseGoalCommand('  /goal  '), { sub: 'show' })
  assert.deepEqual(parseGoalCommand('/goal clear'), { sub: 'clear' })
  assert.deepEqual(parseGoalCommand('/goal OFF'), { sub: 'clear' })
  // `/goal on` re-enables: it is a SHOW, not the literal goal "on".
  assert.deepEqual(parseGoalCommand('/goal on'), { sub: 'show' })
  assert.deepEqual(parseGoalCommand('/goal ship it'), {
    sub: 'set',
    goal: 'ship it',
  })
  // A multi-line goal is kept as one string.
  assert.deepEqual(parseGoalCommand('/goal a' + NL + 'b'), {
    sub: 'set',
    goal: 'a' + NL + 'b',
  })
  assert.equal(parseGoalCommand('/goals'), null)
  assert.equal(parseGoalCommand('goal x'), null)
  assert.equal(parseGoalCommand(undefined as never), null)
})

// ---------- attachment markers ----------

test('markers expand to the real paths, images and files counted apart', () => {
  const attachments = [
    { path: '/p/img1.png', name: 'img1.png', mime: 'image/png' },
    { path: '/p/doc1.txt', name: 'doc1.txt', mime: 'text/plain' },
    { path: '/p/img2.jpg', name: 'img2.jpg' },
  ]
  const out = substituteAttachmentMarkers(
    'see [image#1] and [file#1] and [image#2]',
    attachments,
  )
  assert.equal(out, 'see /p/img1.png and /p/doc1.txt and /p/img2.jpg')
})

test('an image is recognized by its NAME when the mime is missing', () => {
  const out = substituteAttachmentMarkers('[image#1]', [
    { path: '/p/a.png', name: 'a.png' },
  ])
  assert.equal(out, '/p/a.png')
})

test('a marker with no attachment is LEFT AS-IS', () => {
  const out = substituteAttachmentMarkers('keep [image#2] [file#9]', [
    { path: '/p/i.png', name: 'i.png' },
  ])
  assert.equal(out, 'keep [image#2] [file#9]')
  assert.equal(substituteAttachmentMarkers('plain', []), 'plain')
  assert.equal(substituteAttachmentMarkers(undefined as never, []), '')
})

// ---------- failed attachments ----------

test('a failed path becomes the attach-failed marker', () => {
  const out = rewriteFailedAttachments('read /p/a.ts now', [
    { path: '/p/a.ts', name: 'a.ts' },
  ])
  assert.equal(out, 'read [attach-failed: a.ts] now')
})

test('a failed path inside a LONGER healthy one is not rewritten', () => {
  const out = rewriteFailedAttachments('read /p/a.tsx and /p/a.ts', [
    { path: '/p/a.ts', name: 'a.ts' },
  ])
  // Only the WHOLE path match is replaced: `/p/a.tsx` is a different file.
  assert.equal(out, 'read /p/a.tsx and [attach-failed: a.ts]')
})

test('a failed path with regex characters is escaped', () => {
  const out = rewriteFailedAttachments('x /p/a+b(1).txt y', [
    { path: '/p/a+b(1).txt', name: 'f.txt' },
  ])
  assert.equal(out, 'x [attach-failed: f.txt] y')
  // A pathless entry is skipped, not thrown on.
  assert.equal(rewriteFailedAttachments('x', [{} as never]), 'x')
  assert.equal(rewriteFailedAttachments('x', []), 'x')
})

// ---------- custom-command arguments ----------

test('splitCommandArgs keeps quoted words together', () => {
  assert.deepEqual(splitCommandArgs('a b c'), ['a', 'b', 'c'])
  assert.deepEqual(splitCommandArgs('"two words" plain'), [
    'two words',
    'plain',
  ])
  assert.deepEqual(splitCommandArgs("'sq word' x"), ['sq word', 'x'])
  // Extra whitespace collapses.
  assert.deepEqual(splitCommandArgs('   a    b  '), ['a', 'b'])
  assert.deepEqual(splitCommandArgs(''), [])
  assert.deepEqual(splitCommandArgs(undefined as never), [])
})

test('an EMPTY quoted token is a supplied positional', () => {
  // `cmd a ""` deliberately leaves the second argument blank; dropping it
  // made a declared argument count as MISSING and the command was refused.
  assert.deepEqual(splitCommandArgs('a ""'), ['a', ''])
  assert.deepEqual(splitCommandArgs('""'), [''])
})

test('expandCommandArgs substitutes the whole string and the positions', () => {
  const body = 'run {{args}} then $1 and $2 and $name'
  const out = expandCommandArgs(body, 'one two', ['name'])
  assert.equal(out, 'run one two then one and two and one')
  // An UNSUPPLIED position stays as written: `$100` is a price, not an arg.
  assert.equal(expandCommandArgs('cost $100', 'x'), 'cost $100')
  assert.equal(expandCommandArgs('$9', ''), '$9')
  // A bare `$` and a non-word char are left alone.
  assert.equal(expandCommandArgs('a $ b', 'x'), 'a $ b')
})

test('missingCommandArgs reports the declared positions that are absent', () => {
  assert.deepEqual(missingCommandArgs(['x', 'y'], 'a b'), [])
  const missing = missingCommandArgs(['x', 'y'], 'a')
  assert.equal(missing.length, 1)
  assert.equal(missing[0], 'y')
  // Two arguments for two declared names: nothing is missing.
  assert.deepEqual(missingCommandArgs(['x', 'y'], 'a ""'), [])
})
