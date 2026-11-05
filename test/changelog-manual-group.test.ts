// The script-level pipeline of changelog-draft.mts: a hand-written Unreleased
// note must stay in the group it was written under. Appending the manual block
// after the draft used to add a SECOND `### Fixed` heading for a note that
// belonged to the drafted `### Fixed` list.
//
// The helper is private to the script, so the test pins the OBSERVABLE
// contract: the body handed to syncUnreleased for a note in a shared group has
// exactly one heading of that group, and the note sits inside it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderChangelogDraft, syncUnreleased } from '../src/changelog.ts'

const NL = String.fromCharCode(10)

// Mirror of mergeManualIntoDraft in scripts/changelog-draft.mts. Kept in sync
// by hand — the script is not importable from a test (it runs on import).
const mergeManualIntoDraft = (drafted: string, manual: string): string => {
  if (!manual) return drafted
  const blocks = manual.split(/\n(?=## )/)
  let out = drafted
  const extra: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const name = /^## (.+)$/.exec(lines[0].trim())?.[1]
    const bullets = lines.filter((l) => l.trim().startsWith('- '))
    const draftedHeading = name ? '## ' + name : ''
    if (name && out.includes(draftedHeading)) {
      const start = out.indexOf(draftedHeading)
      const rest = out.slice(start + draftedHeading.length)
      const next = rest.search(/\n## /)
      const groupText = (next < 0 ? rest : rest.slice(0, next)).trimEnd()
      const insertAt = start + draftedHeading.length + groupText.length
      out =
        out.slice(0, insertAt) + '\n' + bullets.join('\n') + out.slice(insertAt)
    } else {
      extra.push(block)
    }
  }
  const tail = extra.join('\n').trimEnd()
  return tail ? out.trimEnd() + '\n\n' + tail : out.trimEnd()
}

const drafted = renderChangelogDraft({
  Added: [],
  Fixed: ['- **site:** a fix'],
  Changed: ['- **site:** a tweak'],
  Removed: [],
})

test('a manual note in a drafted group joins it (no second heading)', () => {
  const body = mergeManualIntoDraft(drafted, '## Fixed' + NL + NL + '- note')
  assert.equal((body.match(/## Fixed/g) || []).length, 1)
  assert.ok(body.includes('- **site:** a fix' + NL + '- note'))
})

test('a manual group the draft lacks keeps its own heading', () => {
  const body = mergeManualIntoDraft(drafted, '## Removed' + NL + NL + '- gone')
  assert.ok(body.includes('## Removed' + NL + NL + '- gone'))
  assert.equal((body.match(/## Fixed/g) || []).length, 1)
})

test('the merged body survives syncUnreleased unchanged (idempotent)', () => {
  const file = [
    '## [Unreleased]',
    '',
    '### Fixed',
    '',
    '- **site:** a fix',
    '',
    '### Changed',
    '',
    '- **site:** a tweak',
    '',
    '## [1.0.0]',
    '',
  ].join(NL)
  const body = mergeManualIntoDraft(drafted, '## Fixed' + NL + NL + '- note')
  const once = syncUnreleased(file, body)
  assert.equal((once.match(/### Fixed/g) || []).length, 1)
  assert.ok(once.includes('- note'))
})
