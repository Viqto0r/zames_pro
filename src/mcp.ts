import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ToolArgs, ToolDef, ToolParameters } from './types.js'

// The MCP client advertises a name+version to servers. Read the real version
// from package.json (the previous hardcoded '1.0.0' silently drifted from the
// package). Best-effort: an unreadable package.json must never break MCP.
function packageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(
      fs.readFileSync(path.join(here, '..', 'package.json'), 'utf-8'),
    )
    if (pkg && typeof pkg.version === 'string') return pkg.version
  } catch {
    // fall through
  }
  return '0.0.0'
}

// MCP lets zames use external tool servers. The canonical example is
// @playwright/mcp (microsoft/playwright-mcp): it gives the agent a real
// browser (navigate, click, snapshot, type, ...). The agent already uses
// Playwright internally for chat.deepseek.com, but that instance is not
// exposed as a tool; MCP adds a separate browser the model can drive.
//
// The client is optional and best-effort: MCP is only loaded when a config
// defines servers. A server that fails to start or to list tools never
// breaks the agent - it is just skipped with a warning. A failed tool call
// returns an error string as its result instead of throwing.
//
// Config locations (later files override earlier ones):
//   ~/.zames/mcp.json              global
//   <project>/.zames/mcp.json       project-scoped
//   <project>/.mcp.json             the common MCP name
//
// Config format (same as Claude Code / Cursor):
//
//     {
//       "mcpServers": {
//         "playwright": {
//           "command": "npx",
//           "args": ["-y", "@playwright/mcp@latest", "--headless"],
//           "env": { ... }
//         },
//         "remote": {
//           "url": "https://example.com/mcp",
//           "transport": "sse"
//         }
//       }
//     }
//

/* ---------- config ---------- */

export interface McpServerConfig {
  /** Executable to spawn (stdio transport). */
  command?: string
  /** Arguments for the executable. */
  args?: string[]
  /** Environment variables for the child process. */
  env?: Record<string, string>
  /** Working directory for the child process. */
  cwd?: string
  /** Remote server URL (SSE / streamable HTTP). */
  url?: string
  /** Remote transport kind. Defaults to streamable-http. */
  transport?: 'streamable-http' | 'sse'
  /** Headers for a remote server (e.g. auth). */
  headers?: Record<string, string>
  /** Hide the server from the agent. */
  disabled?: boolean
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>
}

export interface McpServerInfo {
  name: string
  tools: string[]
  error?: string
}

export interface McpStatus {
  servers: McpServerInfo[]
  toolCount: number
  /**
   * Warnings about the config itself (not connection errors), e.g. a server
   * pinned to `@latest`. Operator-facing, so they travel as an i18n KEY + its
   * params and the caller localizes them (the MCP layer has no locale).
   */
  warnings: Array<{ key: string; params: Record<string, string> }>
}

/**
 * Flag stdio servers pinned to a floating version (`@latest` / `@next`).
 * A floating version can change between runs and silently alter the tools the
 * agent sees, so the operator is warned and told to pin an exact version.
 * Pure; exported for tests.
 */
export function floatingVersionWarnings(
  servers: Record<string, McpServerConfig>,
): string[] {
  const out: string[] = []
  for (const [name, cfg] of Object.entries(servers)) {
    if (cfg.disabled) continue
    const args = [String(cfg.command || ''), ...(cfg.args || [])].join(' ')
    if (/@(latest|next)\b/.test(args)) {
      out.push(name)
    }
  }
  return out
}

/** Options for loading MCP servers. */
export interface McpLoadOptions {
  /** Directory used to resolve project-scoped configs. */
  workdir: string
  /** Optional diagnostic logger. */
  debug?: (message: string) => void
}

// @playwright/mcp defaults its --user-data-dir to the SAME profile zames uses
// (~/.zames/profile). Two chromium instances on one profile break each other:
// the chat page shows "Something went wrong when opening your profile" and
// the session is lost. So when a stdio server looks like @playwright/mcp we
// auto-add --isolated (in-memory profile) unless the user already chose a
// profile (--isolated / --user-data-dir / --extension / --cdp-endpoint).
export function hardenPlaywrightArgs(
  command: string,
  args: string[],
): string[] {
  const hay = (String(command || '') + ' ' + args.join(' ')).toLowerCase()
  if (!hay.includes('playwright') || !hay.includes('mcp')) return args
  // The profile flag may sit in the COMMAND itself: a config like
  // `{command: "npx --user-data-dir=/tmp/x", args: ["@playwright/mcp"]}` is
  // legitimate, and checking only `args` appended `--isolated` next to the
  // profile — the server then has BOTH an on-disk profile and an in-memory
  // one and picks unpredictably (the live agent's profile is the very thing
  // this guard exists to protect).
  const all = [String(command || ''), ...args]
  if (
    all.some(
      (a) =>
        // A PREFIX match treated `--isolated=false` as the isolated flag, so
        // the hardener added nothing and the MCP browser opened the agent's
        // live profile anyway. Only a flag EXPLICITLY ON, or a value-taking
        // profile flag, counts; `=false` does not.
        a === '--isolated' ||
        /^--isolated=(?!false$)/.test(a) ||
        a === '--user-data-dir' ||
        a.startsWith('--user-data-dir=') ||
        a.endsWith('--user-data-dir') ||
        a.includes('--user-data-dir=') ||
        a === '--extension' ||
        a.startsWith('--extension=') ||
        a.endsWith('--extension') ||
        a.includes('--extension=') ||
        a === '--cdp-endpoint' ||
        a.startsWith('--cdp-endpoint=') ||
        a.endsWith('--cdp-endpoint') ||
        a.includes('--cdp-endpoint='),
    )
  ) {
    return args
  }
  return [...args, '--isolated']
}

/** Parse one config object into a validated map (best-effort). */
export function normalizeServerConfig(raw: unknown): McpServerConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: McpServerConfig = {}
  if (typeof r.command === 'string') out.command = r.command
  if (Array.isArray(r.args)) out.args = r.args.map((a) => String(a))
  if (r.env && typeof r.env === 'object') {
    out.env = {} as Record<string, string>
    for (const [k, v] of Object.entries(r.env as Record<string, unknown>)) {
      out.env[k] = String(v)
    }
  }
  if (typeof r.cwd === 'string') out.cwd = r.cwd
  if (typeof r.url === 'string') out.url = r.url
  if (r.transport === 'sse' || r.transport === 'streamable-http') {
    out.transport = r.transport
  }
  if (r.headers && typeof r.headers === 'object') {
    out.headers = {} as Record<string, string>
    for (const [k, v] of Object.entries(r.headers as Record<string, unknown>)) {
      out.headers[k] = String(v)
    }
  }
  if (r.disabled === true) out.disabled = true
  if (!out.command && !out.url) return null
  return out
}

/** Candidate config paths, ordered from global to project-local. */
export async function discoverConfigFiles(workdir: string): Promise<string[]> {
  const path = await import('path')
  const os = await import('os')
  const fsMod = await import('fs/promises')
  const candidates = [
    path.join(os.homedir(), '.zames', 'mcp.json'),
    path.join(workdir, '.zames', 'mcp.json'),
    path.join(workdir, '.mcp.json'),
  ]
  const out: string[] = []
  for (const c of candidates) {
    if (await fsMod.stat(c).catch(() => null)) out.push(c)
  }
  return out
}

/** Read and merge every config file. Later files override earlier ones. */
export async function loadConfigFiles(files: string[]): Promise<McpConfig> {
  const merged: Record<string, McpServerConfig> = {}
  const fsMod = await import('fs/promises')
  for (const f of files) {
    try {
      const raw = await fsMod.readFile(f, 'utf-8')
      const json = JSON.parse(raw) as McpConfig
      const servers = json.mcpServers
      if (!servers || typeof servers !== 'object') continue
      for (const [name, cfg] of Object.entries(servers)) {
        const normalized = normalizeServerConfig(cfg)
        if (normalized) merged[name] = normalized
      }
    } catch {
      // Best-effort: a broken MCP config must not break the agent.
    }
  }
  return { mcpServers: merged }
}

/* ---------- json-schema -> agent parameters ---------- */

// MCP tools describe their arguments with a JSON Schema. zames own ToolDef
// uses a flat map (name -> 'type?'), which is what the system-prompt shows
// to the model. We convert the schema into that flat form so MCP tools look
// like built-in ones and the model already knows the convention.
//
// We also keep the full schema in the tool description, so the model sees
// descriptions/enums/required fields that the flat map cannot convey.
export function jsonSchemaToParams(schema: unknown): ToolParameters {
  // Property NAMES come from the server and are arbitrary text: assigning to a
  // plain object, a name like `__proto__` mutates the object's PROTOTYPE and
  // the parameter silently disappears from the prompt (the same class as the
  // tool-count maps in /cost). Null-prototype map: every key is an own key.
  const out: ToolParameters = Object.create(null) as ToolParameters
  if (!schema || typeof schema !== 'object') return out
  const s = schema as {
    properties?: Record<string, unknown>
    required?: string[]
  }
  if (!s.properties || typeof s.properties !== 'object') return out
  const required = new Set(Array.isArray(s.required) ? s.required : [])
  for (const [key, raw] of Object.entries(s.properties)) {
    const prop = (raw || {}) as Record<string, unknown>
    let type = typeof prop.type === 'string' ? prop.type : ''
    if (Array.isArray(prop.type) || prop.enum) type = 'value'
    if (!type) type = 'value'
    out[key] = type + (required.has(key) ? '' : '?')
  }
  return out
}

// Append the raw JSON Schema to the description so the model sees field
// descriptions and enums. The flat map alone cannot convey them, and MCP
// tools (browser_snapshot, browser_click, ...) rely on them heavily.
export function describeParamsExternally(
  description: string,
  schema: unknown,
): string {
  // A JSON Schema may spell the object type as a LIST (`type: ['object']`, a
  // zod-derived or nullable wrapper). Rejecting anything but the exact string
  // 'object' silently dropped the schema — field descriptions and enums — from
  // the model-facing tool description while the flat param map still listed
  // the fields.
  const raw = (schema as { type?: unknown } | undefined)?.type
  const isObject =
    raw === 'object' || (Array.isArray(raw) && raw.includes('object'))
  if (!schema || !isObject) return description
  try {
    const json = JSON.stringify(schema)
    if (json.length > 4000) return description
    return description + '\nJSON Schema: ' + json
  } catch {
    return description
  }
}

/* ---------- result rendering ---------- */

// Cap on the MCP result string handed to the model. MCP results (e.g.
// browser_snapshot) can be hundreds of KB; without a cap a single call floods
// the context and speeds up rate-limiting/truncation. Chosen to match the
// magnitude of the built-in tools' truncation.
export const MCP_RESULT_LIMIT = 12_000

// Truncate a tool-result string with an explicit marker (the model must be able
// to tell it is looking at a partial output). Exported for tests.
export function truncateMcpResult(s: string, limit = MCP_RESULT_LIMIT): string {
  const str = String(s)
  if (str.length <= limit) return str
  // The MARKER is part of the result, so the head must leave room for it:
  // appending it to a limit-long head produced a result WIDER than the cap
  // (the cap exists to bound the context a single MCP call can consume).
  // Reserve the WORST-CASE marker (a 10-digit count), so no result can
  // exceed the cap whatever the omitted length turns out to be.
  const MARKER = '\n[...truncated 9999999999 chars]'
  const budget = Math.max(0, limit - MARKER.length)
  let head = str.slice(0, budget)
  // Never leave a lone HIGH surrogate at the cut: an emoji / astral CJK char
  // sits on two UTF-16 units, and cutting between them hands the model a
  // broken code point (same rule as truncateToolResult / capReport).
  if (head.length > 0) {
    const last = head.charCodeAt(head.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1)
  }
  // Prefer a line boundary so a cut does not split a line in half.
  const nl = head.lastIndexOf(String.fromCharCode(10))
  const cut = nl > budget * 0.5 ? head.slice(0, nl + 1) : head
  const omitted = str.length - cut.length
  return cut + `\n[...truncated ${omitted} chars]`
}

// MCP tool results are a list of content blocks (text, image, resource, ...)
// and an isError flag. The agent needs a single string for the tool result
// message. Images are summarized (the model cannot see them through
// DeepSeek web anyway), text is joined.
export function renderMcpResult(
  result: unknown,
  limit = MCP_RESULT_LIMIT,
): string {
  const r = (result || {}) as {
    content?: Array<unknown>
    toolResult?: unknown
    isError?: boolean
  }

  if (r.toolResult !== undefined && !r.content) {
    return truncateMcpResult(formatResultString(r.toolResult, r.isError), limit)
  }

  // `content` is an ARRAY per the SDK, but a hand-rolled/buggy server may put
  // a STRING there. Iterating that string yielded one part per CHARACTER and
  // the result became `n\n\no\n\nt...` instead of the text.
  const blocks = Array.isArray(r.content)
    ? r.content
    : typeof r.content === 'string'
      ? [{ type: 'text', text: r.content }]
      : []
  const parts: string[] = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      parts.push(String(block ?? ''))
      continue
    }
    const b = block as Record<string, unknown>
    const type = String(b.type ?? '')
    if (type === 'text') {
      parts.push(String(b.text ?? ''))
    } else if (type === 'image') {
      parts.push(
        '[image ' +
          String(b.mimeType ?? 'unknown') +
          ', written to disk by the MCP server]',
      )
    } else if (type === 'resource') {
      const res = (b.resource || {}) as Record<string, unknown>
      if (typeof res.text === 'string') {
        parts.push(String(res.uri ?? '') + String.fromCharCode(10) + res.text)
      } else if (typeof res.blob === 'string') {
        parts.push(
          '[binary resource ' +
            String(res.uri ?? '') +
            ', ' +
            String(res.mimeType ?? '') +
            ']',
        )
      } else {
        parts.push(String(res.uri ?? ''))
      }
    } else if (type === 'resource_link') {
      parts.push(String(b.uri ?? b.name ?? ''))
    } else {
      try {
        parts.push(JSON.stringify(b))
      } catch {
        parts.push(String(b))
      }
    }
  }

  const text = parts
    .filter((p) => p !== '')
    .join(String.fromCharCode(10) + String.fromCharCode(10))
    .trim()
  // A result may carry BOTH a (blank/empty) `content` list AND the real payload
  // in `toolResult` (an SDK server that attaches it there). Preferring content
  // unconditionally reported "(no content)" and DROPPED the real output.
  if (!text && r.toolResult !== undefined) {
    return truncateMcpResult(formatResultString(r.toolResult, r.isError), limit)
  }
  return truncateMcpResult(
    formatResultString(text || '(MCP tool returned no content)', r.isError),
    limit,
  )
}

function formatResultString(result: unknown, isError?: boolean): string {
  const text = typeof result === 'string' ? result : safeJson(result)
  return isError ? 'MCP error: ' + text : text
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v)
    return s === undefined ? String(v) : s
  } catch {
    return String(v)
  }
}

// Namespacing: MCP tool names are prefixed with the server name, so the
// system-prompt (and the transcript) show where a tool comes from and two
// servers cannot collide. The prefix uses __ (double underscore) because
// the model must be able to reproduce it exactly.
export function qualifyToolName(server: string, tool: string): string {
  // BOTH halves must be sanitized: a server name with a space ('my server')
  // produced 'my server__tool', which the model cannot reproduce in a JSON
  // tool call. The same rule on both sides also makes two spellings of one
  // server collide on ONE qualified name, so dedupeToolNames can rename the
  // duplicate instead of leaving both tools unreachable.
  const clean = (s: string): string =>
    String(s || '').replace(/[^A-Za-z0-9_]/g, '_')
  return clean(server) + '__' + clean(tool)
}

// Make every tool name unique IN PLACE. agent-loop resolves a call by name and
// takes the first match, so a duplicate silently shadows the later tool. The
// qualifier is not injective (see the call site), hence this guard. Pure;
// exported for tests.
export function dedupeToolNames(tools: Array<{ name: string }>): void {
  // The rename must avoid EVERY name in the list, not only the ones already
  // visited: a later tool that already owns `<name>_2` (a server's own `x_2`
  // tool) was renamed itself, and the model's call to `x_2` then reached the
  // RENAMED DUPLICATE — the wrong tool.
  const all = new Set(tools.map((t) => t.name))
  const seen = new Set<string>()
  for (const t of tools) {
    if (!seen.has(t.name)) {
      seen.add(t.name)
      continue
    }
    let n = 2
    let candidate = `${t.name}_${n}`
    while (seen.has(candidate) || all.has(candidate)) {
      n++
      candidate = `${t.name}_${n}`
    }
    // The duplicate leaves the pool of ORIGINAL names: its old name belongs to
    // the first tool of that name.
    all.delete(t.name)
    t.name = candidate
    seen.add(candidate)
    all.add(candidate)
  }
}

/* ---------- pool ---------- */

/** The client interface used by the rest of the agent. */
export interface McpPool {
  /** Tool definitions in the agent format. */
  tools: ToolDef[]
  /** Human-readable connection report. */
  status: () => McpStatus
  /** Close every connection and kill the child processes. */
  close: () => Promise<void>
}
// A minimal structural interface over the SDK Client. We deliberately do not
// import the SDK types here: the module must still load when the optional
// dependency is missing, and a hot-reload must not leak SDK types.
interface McpClientLike {
  connect: (transport: unknown) => Promise<void>
  listTools: (params?: unknown) => Promise<{ tools: Array<unknown> }>
  callTool: (params: unknown) => Promise<unknown>
  close: () => Promise<void>
}

interface McpConnection {
  name: string
  client: McpClientLike
  tools: Array<{ name: string; description: string; schema: unknown }>
}

// Connect to ONE server and return a ready connection (or an error).
async function connectServer(
  name: string,
  cfg: McpServerConfig,
  debug?: (message: string) => void,
): Promise<McpConnection | { error: string }> {
  // Declared OUTSIDE the try so the catch can close a half-open server: a
  // stdio transport SPAWNS a child process on connect, and if connect() or
  // listTools() throws we would otherwise leak an orphan process on every run.
  let client: McpClientLike | null = null
  let transport: { close?: () => Promise<void> | void } | null = null
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const c = new Client(
      { name: 'zames', version: packageVersion() },
      { capabilities: {} },
    ) as unknown as McpClientLike
    client = c

    if (cfg.url) {
      if (cfg.transport === 'sse') {
        const { SSEClientTransport } =
          await import('@modelcontextprotocol/sdk/client/sse.js')
        transport = new SSEClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
        })
      } else {
        const { StreamableHTTPClientTransport } =
          await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
        })
      }
    } else {
      const { StdioClientTransport } =
        await import('@modelcontextprotocol/sdk/client/stdio.js')
      transport = new StdioClientTransport({
        command: String(cfg.command),
        args: hardenPlaywrightArgs(String(cfg.command), cfg.args || []),
        env: cfg.env,
        cwd: cfg.cwd,
        stderr: 'pipe',
      })
    }

    await c.connect(transport as never)
    const listed = await c.listTools()
    const tools = (listed.tools || []).map((t) => {
      const tool = t as {
        name: string
        description?: string
        inputSchema?: unknown
      }
      return {
        name: String(tool.name),
        description: String(tool.description || ''),
        schema: tool.inputSchema,
      }
    })
    debug?.(`MCP: connected to ${name} (${tools.length} tools)`)
    return { name, client: c, tools }
  } catch (e) {
    const msg = (e as Error).message || String(e)
    debug?.(`MCP: failed to connect to ${name}: ${msg}`)
    // Close a half-open connection so a spawned stdio child is not orphaned.
    try {
      if (client) await client.close().catch(() => {})
    } catch {}
    try {
      if (transport?.close)
        await Promise.resolve(transport.close()).catch(() => {})
    } catch {}
    return { error: msg }
  }
}

/**
 * Build a pool from the MCP configs found for a workdir.
 * Never throws: a broken server is reported in the status and skipped.
 */
export async function createMcpPool(opts: McpLoadOptions): Promise<McpPool> {
  const files = await discoverConfigFiles(opts.workdir)
  const config = await loadConfigFiles(files)
  const servers = config.mcpServers || {}
  const names = Object.keys(servers).filter((n) => !servers[n].disabled)

  const floating = floatingVersionWarnings(servers)

  const infos: McpServerInfo[] = []
  const connections: McpConnection[] = []
  const tools: ToolDef[] = []

  for (const name of names) {
    const cfg = servers[name]
    const res = await connectServer(name, cfg, opts.debug)
    if ('error' in res) {
      infos.push({ name, tools: [], error: res.error })
      continue
    }
    connections.push(res)
    infos.push({ name, tools: res.tools.map((t) => t.name) })

    for (const tool of res.tools) {
      const qualified = qualifyToolName(name, tool.name)
      const params = jsonSchemaToParams(tool.schema)
      const description = describeParamsExternally(
        (tool.description || tool.name) + ` (MCP server: ${name})`,
        tool.schema,
      )
      tools.push({
        name: qualified,
        description,
        parameters: params,
        fn: async (args: ToolArgs) => {
          try {
            const result = await res.client.callTool({
              name: tool.name,
              arguments: args,
            })
            return renderMcpResult(result)
          } catch (e) {
            return `MCP error (${name}/${tool.name}): ${(e as Error).message}`
          }
        },
      })
    }
  }

  // Distinct servers can produce the SAME qualified name (server 'a' + tool
  // 'b__c' vs server 'a__b' + tool 'c'); dedupeToolNames below explains why
  // that has to be fixed rather than left to tools.find().
  dedupeToolNames(tools)

  let closed = false
  return {
    tools,
    status: () => ({
      servers: infos,
      toolCount: tools.length,
      warnings: floating.map((n) => ({
        key: 'mcp.floating',
        params: { v: n },
      })),
    }),
    close: async () => {
      if (closed) return
      closed = true
      for (const c of connections) {
        try {
          await c.client.close()
        } catch {
          // ignore
        }
      }
    },
  }
}
