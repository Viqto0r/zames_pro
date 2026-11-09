import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Every section file the catalog merges. A NEW section must be listed here
// too, otherwise it can ship without a header or without the shared type.
const SECTIONS: Array<[string, string]> = [
  ['common.ts', 'commonMessages'],
  ['help.ts', 'helpMessages'],
  ['spinner.ts', 'spinnerMessages'],
  ['doctor.ts', 'doctorMessages'],
  ['deepseek.ts', 'deepseekMessages'],
  ['self-review.ts', 'selfReviewMessages'],
  ['mcp.ts', 'mcpMessages'],
  ['config.ts', 'configMessages'],
  ['prompt.ts', 'promptMessages'],
  ['wizard.ts', 'wizardMessages'],
  ['qwen.ts', 'qwenMessages'],
  ['glm.ts', 'glmMessages'],
]

function sectionSource(name: string): string {
  return readFileSync(join(root, 'src', 'i18n', name), 'utf-8')
}

test('every catalog section opens with a purpose comment', () => {
  for (const [file] of SECTIONS) {
    const src = sectionSource(file)
    const lines = src.split(String.fromCharCode(10))
    // At least one leading `//` line BEFORE the first code line: the header
    // says which surface the file owns, so a new key is filed in the right
    // section instead of the first one that compiles.
    const firstCode = lines.findIndex((l) => l.trim() && !l.startsWith('//'))
    assert.ok(firstCode > 0, file + ' has no leading header comment')
    for (let i = 0; i < firstCode; i++) {
      // A BLANK line between two comment paragraphs is still inside the
      // header; only a code line ends it.
      const line = lines[i]
      assert.ok(
        line.trim() === '' || line.startsWith('//'),
        file + ' line ' + (i + 1) + ' is not a comment',
      )
    }
  }
})

test('every section exports the shared { ru, en } record type', () => {
  for (const [file, exportName] of SECTIONS) {
    const src = sectionSource(file)
    const re = new RegExp(
      'export const ' +
        exportName +
        ': Record<string, \{ ru: string; en: string \}> = \{',
    )
    assert.match(
      src,
      re,
      file + ' does not declare ' + exportName + ' with the { ru, en } type',
    )
  }
})

test('the merge in src/i18n.ts imports every section file', () => {
  const src = readFileSync(join(root, 'src', 'i18n.ts'), 'utf-8')
  for (const [file, exportName] of SECTIONS) {
    assert.ok(
      src.includes("from './i18n/" + file.replace(/\.ts$/, '.js') + "'"),
      file + ' is not imported by src/i18n.ts',
    )
    assert.ok(
      src.includes('...' + exportName + ','),
      exportName + ' is not spread into CATALOG',
    )
  }
})
