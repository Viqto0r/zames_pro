// Run ESLint so that typescript-eslint uses the TypeScript 6 API.
//
// The project is built with TypeScript 7, but typescript-eslint (8.x) does
// not support the TS 7 API yet and refuses to start. Its own recommendation is
// to run "side by side with TypeScript 6": load the TS 6 compiler just for the
// linter. We do that by aliasing the `typescript` module to the `typescript-6`
// package for the duration of the ESLint process, without touching the
// compiler the project actually builds with.
import { createRequire } from 'module'
import Module from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

// Module._resolveFilename is a private Node field (not in @types/node), so it
// is reached through a small structural type instead of `any`.
type ModuleWithResolve = typeof Module & {
  _resolveFilename: (request: string, ...rest: unknown[]) => string
}

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const ts6 = path.join(here, '..', 'node_modules', 'typescript-6')

try {
  require.resolve(path.join(ts6, 'lib', 'typescript.js'))
} catch {
  console.error(
    'eslint-ts6: the typescript-6 package is missing. Run: npm i -D typescript-6@npm:typescript@6',
  )
  process.exit(1)
}

// Patch Module._resolveFilename so any require('typescript') resolves to the
// TS 6 package instead of the TS 7 the project depends on.
const M = Module as ModuleWithResolve
const origResolve = M._resolveFilename
M._resolveFilename = (request: string, ...rest: unknown[]) => {
  if (request === 'typescript') {
    try {
      return require.resolve(path.join(ts6, 'lib', 'typescript.js'))
    } catch {
      return origResolve(request, ...rest)
    }
  }
  return origResolve(request, ...rest)
}

const { ESLint } = await import('eslint')
const eslint = new ESLint({ fix: process.argv.includes('--fix') })
const results = await eslint.lintFiles(['.'])
if (process.argv.includes('--fix')) {
  await ESLint.outputFixes(results)
}
const formatter = await eslint.loadFormatter('stylish')
const out = await formatter.format(results)
if (out) process.stdout.write(out)
const errors = results.reduce((n, r) => n + r.errorCount, 0)
process.exit(errors > 0 ? 1 : 0)
