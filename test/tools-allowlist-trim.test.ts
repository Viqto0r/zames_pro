import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterToolsByAllowList } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

const tools = [
  { name: 'Read' },
  { name: 'Bash' },
  { name: 'respond' },
] as unknown as ToolDef[]

// `allowed-tools:` is human-written frontmatter. `parseFrontmatter` splits it
// on `[,\s]+` and drops empties, but a value like `allowed-tools: " Read "`
// (quoted) keeps the surrounding spaces, and a trailing comma inside a quoted
// item can leave `"read "`. `filterToolsByAllowList` lower-cased but did NOT
// trim, so `read ` matched nothing — the skill could only call `respond`, which
// looked like a broken skill rather than a typo. Names must be trimmed.
test('an allow-list entry with surrounding spaces still matches', () => {
  assert.deepEqual(
    filterToolsByAllowList(tools, [' Read ']).map((t) => t.name),
    ['Read', 'respond'],
  )
  assert.deepEqual(
    filterToolsByAllowList(tools, ['read ']).map((t) => t.name),
    ['Read', 'respond'],
  )
})

test('a list of only whitespace keeps the run finishable via respond', () => {
  assert.deepEqual(
    filterToolsByAllowList(tools, [' ']).map((t) => t.name),
    ['respond'],
  )
})
