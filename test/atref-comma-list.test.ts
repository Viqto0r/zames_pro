import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractAtFileRefs } from '../src/path-token.ts'

// `@file` references are often written as a COMMA-separated list —
// `look at @a.ts,@b.ts`. The token scanner ends only on whitespace/brackets/
// quotes, so the whole `a.ts,@b.ts` became ONE path: the first file's
// extension consumed the comma and both refs were lost (neither file was
// inlined into the task).

test('@refs: a comma-separated list is split into two references', () => {
  assert.deepEqual(extractAtFileRefs('look at @a.ts,@b.ts'), ['a.ts', 'b.ts'])
})

test('@refs: a comma inside the PATH is not a separator when unquoted', () => {
  // A real file name may contain a comma, but the model/operator writes the
  // list form far more often; a trailing comma right after an EXTENSION is
  // the list case (`a.ts,` / `a.ts ,`).
  assert.deepEqual(extractAtFileRefs('@a.ts, please'), ['a.ts'])
})
