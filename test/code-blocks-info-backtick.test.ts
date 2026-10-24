// extractCodeBlocks() recovers the RAW fenced code from a Markdown answer.
// The OPENING-fence regex is `^(\s*)(`{3,}|~{3,})\s*([^`]*)$` — the info
// string forbids a backtick. When a model writes a fence with a backtick in
// the info (` ```ts` `, ` ```c++ `std::vector` `) the line does NOT match, so
// the block's own CLOSING ``` is then read as an OPENING fence: the following
// text (and the next real block) is swallowed into one bogus block with lang
// '' and wrong index. The operator copied "block 1" and got prose.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCodeBlocks } from '../src/code-blocks.ts'

const NL = String.fromCharCode(10)

test('a fence whose info string contains a backtick still opens a block', () => {
  const md = ['```ts`', 'const a = 1', '```', 'after'].join(NL)
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1, JSON.stringify(b))
  assert.equal(b[0].text, 'const a = 1', JSON.stringify(b[0]))
})

test('a backtick in the info does not swallow the following block', () => {
  const md = [
    '```c++ `std::vector`',
    'v.push_back(1);',
    '```',
    'text',
    '```py',
    'print(1)',
    '```',
  ].join(NL)
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 2, JSON.stringify(b))
  assert.equal(b[0].text, 'v.push_back(1);')
  assert.equal(b[1].lang, 'py')
  assert.equal(b[1].text, 'print(1)')
})
