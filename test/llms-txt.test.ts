import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLlms } from '../scripts/build-llms.mts'
import { readTopics, topicsCommand } from '../scripts/seo-topics.mts'

// The discoverability surfaces for search engines and AI assistants must not
// drift: llms.txt/llms-full.txt are generated from docs/, and the topic list is
// the single source for the GitHub metadata (applied through the GitHub API by
// the agent, never typed into the repository settings by a human).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('llms.txt at the repository root matches docs/llms.txt', () => {
  const { short } = buildLlms(root)
  const onDisk = fs.readFileSync(path.join(root, 'llms.txt'), 'utf-8')
  assert.equal(onDisk, short, 'llms.txt drifted: run npm run build:llms')
})

test('llms-full.txt matches the English README body', () => {
  const { full } = buildLlms(root)
  const onDisk = fs.readFileSync(path.join(root, 'llms-full.txt'), 'utf-8')
  assert.equal(onDisk, full, 'llms-full.txt drifted: run npm run build:llms')
})

test('llms.txt starts with a level-1 title and a blockquote summary', () => {
  const text = fs.readFileSync(path.join(root, 'llms.txt'), 'utf-8')
  assert.match(text, /^# zames_pro/, 'llms.txt has no H1 title')
  assert.match(text, /\n> /, 'llms.txt has no summary blockquote')
  assert.ok(
    text.includes('https://www.npmjs.com/package/zames_pro'),
    'llms.txt does not link the npm package',
  )
  assert.ok(
    text.includes('https://github.com/Viqto0r/zames_pro'),
    'llms.txt does not link the repository',
  )
})

test('repository topics are valid and applied in one gh command', () => {
  const topics = readTopics(root)
  assert.ok(topics.length >= 10, 'too few topics to be useful')
  assert.equal(new Set(topics).size, topics.length, 'duplicate topics')
  assert.ok(topics.includes('coding-agent'), 'the main topic is missing')
  const cmd = topicsCommand(topics)
  assert.deepEqual(cmd.slice(0, 4), [
    'repo',
    'edit',
    '--add-topic',
    topics.join(','),
  ])
})

test('CITATION.cff and FUNDING.yml exist and cite this project', () => {
  const cff = fs.readFileSync(path.join(root, 'CITATION.cff'), 'utf-8')
  assert.match(cff, /^cff-version:/m)
  assert.ok(cff.includes('https://github.com/Viqto0r/zames_pro'))
  assert.ok(cff.includes('license: MIT'))
  const funding = fs.readFileSync(
    path.join(root, '.github', 'FUNDING.yml'),
    'utf-8',
  )
  assert.match(funding, /^github: Viqto0r$/m)
})

test('package.json carries the search metadata', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf-8'),
  ) as {
    keywords: string[]
    author?: { name?: string }
    repository?: { url?: string }
    homepage?: string
    bugs?: { url?: string }
    funding?: { url?: string }
    files?: string[]
    scripts?: Record<string, string>
  }
  assert.ok(pkg.keywords.length >= 40, 'too few npm keywords')
  for (const k of ['coding agent', 'no api key', 'deepseek', 'qwen']) {
    assert.ok(pkg.keywords.includes(k), 'missing keyword: ' + k)
  }
  assert.ok(pkg.author?.name, 'package.json has no author')
  assert.ok(pkg.repository?.url?.includes('github.com/Viqto0r/zames_pro'))
  assert.ok(pkg.homepage?.includes('github.com/Viqto0r/zames_pro'))
  assert.ok(pkg.bugs?.url?.includes('/issues'))
  assert.ok(pkg.funding?.url, 'package.json has no funding')
  assert.ok(pkg.files?.includes('llms.txt'), 'llms.txt is not published')
  assert.ok(pkg.scripts?.['build:llms'], 'build:llms script is missing')
})

test('the README FAQ answers the searchable questions', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  for (const q of [
    'Is zames free?',
    'Can I use it with DeepSeek?',
    'What are the alternatives?',
    'Which keywords describe zames?',
  ]) {
    assert.ok(readme.includes(q), 'README FAQ lost: ' + q)
  }
  assert.ok(
    readme.includes('## Keywords and alternatives'),
    'README lost the keywords section',
  )
})
