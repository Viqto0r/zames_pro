import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import { createExtraTools } from '../src/extraTools.ts'
import type { ToolDef } from '../src/types.ts'

function tmpDir(): Promise<string> {
 return fs.mkdtemp(path.join(os.tmpdir(), 'zames-undef-'))
}

function tool(tools: ToolDef[], name: string): ToolDef {
 const t = tools.find((x) => x.name === name)
 if (!t) throw new Error('no tool ' + name)
 return t
}

async function noUndefinedFile(dir: string): Promise<boolean> {
 const entries = await fs.readdir(dir)
 return !entries.includes('undefined')
}

// A tool call that omits path (or sends null) must NOT create a file
// literally named "undefined" in the working directory. That was the real
// bug: String(undefined) === "undefined".

test('Write without path does not create file "undefined"', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () =>
 tool(tools, 'Write').fn({ content: 'x' } as never),
 )
 assert.ok(await noUndefinedFile(dir), 'file "undefined" was created')
 await fs.rm(dir, { recursive: true, force: true })
})

test('Write with path=null does not create file "undefined"', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () =>
 tool(tools, 'Write').fn({ path: null, content: 'x' } as never),
 )
 assert.ok(await noUndefinedFile(dir), 'file "undefined" was created')
 await fs.rm(dir, { recursive: true, force: true })
})

test('Write with path="undefined" is rejected', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () =>
 tool(tools, 'Write').fn({ path: 'undefined', content: 'x' } as never),
 )
 await fs.rm(dir, { recursive: true, force: true })
})

test('Read without path is rejected', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () => tool(tools, 'Read').fn({} as never))
 await fs.rm(dir, { recursive: true, force: true })
})

test('Edit without path is rejected', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () =>
 tool(tools, 'Edit').fn({ old_string: 'a', new_string: 'b' } as never),
 )
 await fs.rm(dir, { recursive: true, force: true })
})

test('Bash without command is rejected', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () => tool(tools, 'Bash').fn({} as never))
 await fs.rm(dir, { recursive: true, force: true })
})

test('Glob without pattern is rejected', async () => {
 const dir = await tmpDir()
 const tools = createTools(dir, {})
 await assert.rejects(async () => tool(tools, 'Glob').fn({} as never))
 await fs.rm(dir, { recursive: true, force: true })
})

test('MultiEdit without path does not create file "undefined"', async () => {
 const dir = await tmpDir()
 const tools = createExtraTools(dir, {})
 await assert.rejects(async () =>
 tool(tools, 'MultiEdit').fn({
 edits: [{ old_string: 'a', new_string: 'b' }],
 } as never),
 )
 assert.ok(await noUndefinedFile(dir), 'file "undefined" was created')
 await fs.rm(dir, { recursive: true, force: true })
})

test('ApplyPatch without patch is rejected', async () => {
 const dir = await tmpDir()
 const tools = createExtraTools(dir, {})
 await assert.rejects(async () => tool(tools, 'ApplyPatch').fn({} as never))
 assert.ok(await noUndefinedFile(dir))
 await fs.rm(dir, { recursive: true, force: true })
})
