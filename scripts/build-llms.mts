// Assemble llms.txt and llms-full.txt for LLM/AI crawlers.
//
// Why: search engines and AI assistants (ChatGPT, Claude, Perplexity, Copilot)
// increasingly read a machine-oriented summary of a project instead of scraping
// HTML. GitHub renders Markdown, so a committed llms.txt at the repository root
// is picked up directly (the llms.txt convention, https://llmstxt.org).
//
// llms.txt      — the short curated map, hand-written in docs/llms.txt. The
//                 docs/ copy is the SOURCE (edit it there); the root copy is
//                 the published artifact a crawler reads, so the two are
//                 byte-identical by construction (test/llms-txt.test.ts).
// llms-full.txt — the full English README body, generated from
//                 docs/readme.en.md so the documentation has ONE source of
//                 truth and the generated file cannot drift.
//
// Usage: npm run build:llms   (test/llms-txt.test.ts checks the drift)
//
// llms.txt lives in docs/ and is COPIED to the repository root because that is
// where the convention looks for it; docs/ is the hand-edited source. The copy
// must stay byte-identical, otherwise a crawler and the repo disagree.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NL = String.fromCharCode(10)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SWITCHER = '<!-- SWITCHER -->'

export function buildLlmsFull(rootDir: string): string {
  const file = path.join(rootDir, 'docs', 'readme.en.md')
  const text = fs.readFileSync(file, 'utf-8')
  const i = text.indexOf(SWITCHER)
  if (i < 0) {
    throw new Error(
      file + ' has no ' + SWITCHER + ' marker (was it edited by hand?)',
    )
  }
  const body = text
    .slice(i + SWITCHER.length)
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
  const head = [
    '# zames_pro — full documentation for LLMs',
    '',
    '> Terminal coding agent that drives a real web chat LLM (DeepSeek, Qwen,',
    '> GLM) through a Playwright browser (DeepSeek and Qwen headless, GLM in a',
    '> visible window) — no API key required.',
    '> Package: https://www.npmjs.com/package/zames_pro',
    '> Source: https://github.com/Viqto0r/zames_pro',
    '',
    'The text below is the English README verbatim.',
    '',
  ].join(NL)
  return head + body + NL
}

const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
export function buildLlms(rootDir: string): {
  short: string
  full: string
} {
  return {
    short: fs.readFileSync(path.join(rootDir, 'docs', 'llms.txt'), 'utf-8'),
    full: buildLlmsFull(rootDir),
  }
}

if (invoked) {
  const { short, full } = buildLlms(root)
  fs.writeFileSync(path.join(root, 'llms.txt'), short)
  fs.writeFileSync(path.join(root, 'llms-full.txt'), full)
  console.log('build-llms: wrote llms.txt and llms-full.txt')
}
