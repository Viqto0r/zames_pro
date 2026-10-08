import fs from 'node:fs'
import path from 'node:path'

// Resolve a path against the sandbox root and reject anything that leaves it.
// The LEXICAL check (comparing the resolved path with the root) is not
// enough: a symlink inside the project can point outside it, and the
// lexical path would still look inside. Therefore the real path
// (fs.realpath, which follows links) is compared too. For a path that
// does not exist yet (writing a new file) the nearest existing ancestor
// is resolved and the remainder is appended on top.
function realPathNearest(target: string): string {
  let cur = target
  const tail: string[] = []
  while (true) {
    try {
      return path.join(fs.realpathSync(cur), ...tail.slice().reverse())
    } catch {
      // not found (or a broken link) -> climb to the parent
    }
    const parent = path.dirname(cur)
    if (parent === cur) return target
    tail.push(path.basename(cur))
    cur = parent
  }
}

/**
 * Return the absolute path of `p` within `root`, or throw. The check is
 * double: lexical (catches `../` traversal) and real (catches a symlink
 * escape). Pure except for the fs.realpathSync calls, which are sync on
 * purpose: the callers are sync tool handlers and turning them async would
 * just add noise.
 */
export function safePath(root: string, p: string): string {
  const resolved = path.resolve(root, p)
  // startsWith(root) would let through sibling paths with a common
  // prefix (C:\work\proj vs C:\work\proj-old). We compute via relative().
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Access outside the working directory is forbidden: ${p}`)
  }
  const realRoot = realPathNearest(path.resolve(root))
  const realTarget = realPathNearest(resolved)
  const realRel = path.relative(realRoot, realTarget)
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    throw new Error(`Access outside the working directory is forbidden: ${p}`)
  }
  return resolved
}
