import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  inlineAtRefs,
  AT_REF_FILE_CAP,
  AT_REF_TOTAL_CAP,
} from '../src/attach-refs.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `inlineAtRefs` stops adding files once the TOTAL budget is spent, but it
// checked the budget AFTER reading the next file and only stepped back from a
// cut inside the PER-FILE cap. A file that fits the per-file cap but overshoots
// the remaining total was inlined WHOLE, so the section blew past
// AT_REF_TOTAL_CAP — the exact flood the cap exists to prevent (a 60 KB file
// after 190 KB are already inlined adds another 60 KB, not 10 KB).
test('an @ref that overshoots the total budget is trimmed, not inlined whole', async (t) => {
  const root = await makeTmpDir(t, 'zames-atref-total-')
  // Two per-file-cap-sized files: the first fills ~60 KB, the second would
  // take the section past the 200 KB total if inlined whole, several times.
  const big = 'a'.repeat(AT_REF_FILE_CAP)
  await fs.writeFile(path.join(root, 'one.ts'), big)
  await fs.writeFile(path.join(root, 'two.ts'), big)
  await fs.writeFile(path.join(root, 'three.ts'), big)
  await fs.writeFile(path.join(root, 'four.ts'), big)
  const res = await inlineAtRefs(root, 'see @one.ts @two.ts @three.ts @four.ts')
  const section = res.text.slice(res.text.indexOf('## Files referenced'))
  // The section itself (the payload handed to the model) must respect the cap;
  // a little slack covers the headings and fences, but never another full file.
  assert.ok(
    section.length <= AT_REF_TOTAL_CAP + AT_REF_FILE_CAP / 4,
    'inlined section is ' + section.length + ' chars, over the total cap',
  )
})
