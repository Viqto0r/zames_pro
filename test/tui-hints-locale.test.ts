import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Ink dialogs (SelectList / ConfigMenu / ConfirmDialog) render their
// key-hint bar on every screen, but the labels used to be hardcoded Russian
// ("выбор", "отмена"): an English-UI operator saw a Russian hint bar and a
// translator had no way to fix it. Operator text must go through the i18n
// CATALOG, so this guard reads the actual component sources and checks every
// HintBar label.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CYRILLIC = /[\u0400-\u04FF]/

// A pair like ['↓', '"выбор"'] inside a component's `hints={[...]}` literal.
// The label is the SECOND string of the pair; a key like 'Enter' is ASCII and
// is never flagged.
const HINT_PAIR = /\[\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g

function cyrillicLabels(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(HINT_PAIR)) {
    // Only the LABEL is checked: a key could be a foreign letter (e.g. `д`
    // for a Russian "yes"), but that is a key, not prose.
    if (CYRILLIC.test(m[2])) out.push(m[2])
  }
  return out
}

for (const name of ['SelectList.tsx', 'ConfigMenu.tsx', 'ConfirmDialog.tsx']) {
  test(name + ': HintBar labels go through the i18n catalog', () => {
    const src = fs.readFileSync(path.join(root, 'src', 'tui', name), 'utf-8')
    const offenders = cyrillicLabels(src)
    assert.deepEqual(
      offenders,
      [],
      name + ' has hardcoded Russian hint labels: ' + offenders.join(', '),
    )
  })
}

test('SelectList translates its hints (no hardcoded text)', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'SelectList.tsx'),
    'utf-8',
  )
  // The component must read a locale (props or a translate call) and not print a literal label.
  assert.ok(
    /translate\(l|\bt\s*\(/.test(src),
    'SelectList must translate its hints',
  )
})
