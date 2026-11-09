import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadCommands } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// test/context.test.ts pins `loadCommands` on a happy-path command and on
// `argument-hint`/`arguments`. The FRONTMATTER PARSER itself (a hand-rolled
// YAML subset) has more rules that a user-written command relies on, and none
// of them was pinned: quoted values, folded lines, comments, a duplicate key,
// a list written with `-` items, and the folder precedence.

const NL = String.fromCharCode(10)

async function command(root: string, rel: string, body: string): Promise<void> {
  const p = path.join(root, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, body)
}

async function load(root: string): Promise<Map<string, unknown>> {
  const cmds = await loadCommands(root)
  return new Map(cmds.map((c) => [c.name, c]))
}

test('a quoted value is unquoted; a plain one keeps its text', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    [
      '---',
      'description: "quoted: text"',
      "argument-hint: '<a> <b>'",
      '---',
      'body',
    ].join(NL),
  )
  const c = (await load(root)).get('a') as {
    description: string
    argumentHint: string
  }
  assert.equal(c.description, 'quoted: text')
  assert.equal(c.argumentHint, '<a> <b>')
})

test('continuation lines are folded into the previous key', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    ['---', 'description: first', '  second', '  third', '---', 'body'].join(
      NL,
    ),
  )
  const c = (await load(root)).get('a') as { description: string }
  assert.equal(c.description, 'first second third')
})

test('a comment line and a blank line are ignored', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    ['---', '# a comment', '', 'description: real', '---', 'body'].join(NL),
  )
  const c = (await load(root)).get('a') as { description: string }
  assert.equal(c.description, 'real')
})

test('a DUPLICATE key keeps the LAST value', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    ['---', 'description: first', 'description: second', '---', 'body'].join(
      NL,
    ),
  )
  const c = (await load(root)).get('a') as { description: string }
  assert.equal(c.description, 'second')
})

test('a `|` / `>` value starts empty (its block is not glued on)', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    ['---', 'description: |', '---', 'body'].join(NL),
  )
  const c = (await load(root)).get('a') as { description: string }
  assert.equal(c.description, '')
})

test('arguments split on commas/whitespace and drop `-` and empties', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(
    root,
    '.zames/commands/a.md',
    ['---', 'arguments: a,,b, -  c', '---', 'body'].join(NL),
  )
  const c = (await load(root)).get('a') as { arguments: string[] }
  assert.deepEqual(c.arguments, ['a', 'b', 'c'])
})

test('a file WITHOUT frontmatter is a command with an empty description', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(root, '.zames/commands/plain.md', 'just a body')
  const c = (await load(root)).get('plain') as {
    description: string
    body: string
  }
  assert.equal(c.description, '')
  assert.equal(c.body, 'just a body')
})

test('only .md files (any case) are commands; a FOLDER named x.md is not', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  const dir = '.zames/commands'
  await command(root, dir + '/upper.MD', 'upper body')
  await command(root, dir + '/notes.txt', 'not a command')
  await fs.mkdir(path.join(root, dir, 'folder.md'), { recursive: true })
  const cmds = await load(root)
  // The name is the FILE NAME minus only a lowercase `.md` (path.basename(e,
  // '.md')), so `upper.MD` keeps its extension: pinned as-is, not 'fixed'.
  assert.deepEqual([...cmds.keys()].sort(), ['upper.MD'])
})

test('a project command WINS over the same name in a later folder', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  await command(root, '.zames/commands/dup.md', 'from zames dir')
  await command(root, '.claude/commands/dup.md', 'from claude dir')
  await command(root, '.agents/commands/dup.md', 'from agents dir')
  const cmds = await loadCommands(root)
  const dup = cmds.filter((c) => c.name === 'dup')
  assert.equal(dup.length, 1, 'a duplicate name must be collapsed')
  assert.equal(dup[0].body, 'from zames dir')
})

test('the command list is sorted by name', async (t) => {
  const root = await makeTmpDir(t, 'zames-cmd-')
  for (const n of ['zeta', 'alpha', 'Mid']) {
    await command(root, `.zames/commands/${n}.md`, 'b')
  }
  const names = (await loadCommands(root)).map((c) => c.name)
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b)),
  )
})
