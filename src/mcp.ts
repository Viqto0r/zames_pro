import type { ToolArgs, ToolDef, ToolParameters } from './types.js'

// ---------- MCP (Model Context Protocol) client ----------
//
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
}

/** Options for loading MCP servers. */
export interface McpLoadOptions {
  /** Directory used to resolve project-scoped configs. */
  workdir: string
  /** Optional diagnostic logger. */
  debug?: (message: string) => void
}

/** Names of the servers found in a config, before any connection. */
export async function listConfiguredServers(workdir: string): Promise<string[]> {
  const files = await discoverConfigFiles(workdir)
  const config = await loadConfigFiles(files)
  const servers = config.mcpServers || {}
  return Object.keys(servers).filter((n) => !servers[n].disabled)
}

// @playwright/mcp defaults its --user-data-dir to the SAME profile zames uses
// (~/.zames/profile). Two chromium instances on one profile break each other:
// the chat page shows "Something went wrong when opening your profile" and
// the session is lost. So when a stdio server looks like @playwright/mcp we
// auto-add --isolated (in-memory profile) unless the user already chose a
// profile (--isolated / --user-data-dir / --extension / --cdp-endpoint).
export function hardenPlaywrightArgs(command: string, args: string[]): string[] {
  const hay = (String(command || '') + ' ' + args.join(' ')).toLowerCase()
  if (!hay.includes('playwright') || !hay.includes('mcp')) return args
  if (args.some((a) => a === '--isolated' || a.startsWith('--user-data-dir') || a === '--extension' || a.startsWith('--cdp-endpoint'))) {
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
  const out: ToolParameters = {}
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
  const type = (schema as { type?: string } | undefined)?.type
  if (!schema || type !== 'object') return description
  try {
    const json = JSON.stringify(schema)
    if (json.length > 4000) return description
    return description + '\nJSON Schema: ' + json
  } catch {
    return description
  }
}

/* ---------- result rendering ---------- */

// MCP tool results are a list of content blocks (text, image, resource, ...)
// and an isError flag. The agent needs a single string for the tool result
// message. Images are summarized (the model cannot see them through
// DeepSeek web anyway), text is joined.
export function renderMcpResult(result: unknown): string {
  const r = (result || {}) as {
    content?: Array<unknown>
    toolResult?: unknown
    isError?: boolean
  }

  if (r.toolResult !== undefined && !r.content) {
    return formatResultString(r.toolResult, r.isError)
  }

  const parts: string[] = []
  for (const block of r.content || []) {
    if (!block || typeof block !== 'object') {
      parts.push(String(block ?? ''))
      continue
    }
    const b = block as Record<string, unknown>
    const type = String(b.type ?? '')
    if (type === 'text') {
      parts.push(String(b.text ?? ''))
    } else if (type === 'image') {
      parts.push('[image ' + String(b.mimeType ?? 'unknown') + ', written to disk by the MCP server]')
    } else if (type === 'resource') {
      const res = (b.resource || {}) as Record<string, unknown>
      if (typeof res.text === 'string') {
        parts.push(String(res.uri ?? '') + String.fromCharCode(10) + res.text)
      } else if (typeof res.blob === 'string') {
        parts.push('[binary resource ' + String(res.uri ?? '') + ', ' + String(res.mimeType ?? '') + ']')
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

  const text = parts.filter((p) => p !== '').join(String.fromCharCode(10) + String.fromCharCode(10)).trim()
  return formatResultString(text || '(MCP tool returned no content)', r.isError)
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
  return server + '__' + tool.replace(/[^A-Za-z0-9_]/g, '_')
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
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const client = new Client(
      { name: 'zames', version: '1.0.0' },
      { capabilities: {} },
    ) as unknown as McpClientLike

    let transport: unknown
    if (cfg.url) {
      if (cfg.transport === 'sse') {
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
        transport = new SSEClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
        })
      } else {
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
        })
      }
    } else {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
      transport = new StdioClientTransport({
        command: String(cfg.command),
        args: hardenPlaywrightArgs(String(cfg.command), cfg.args || []),
        env: cfg.env,
        cwd: cfg.cwd,
        stderr: 'pipe',
      })
    }

    await client.connect(transport as never)
    const listed = await client.listTools()
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
    debug?.(`MCP: connected to ${name} (${tools.length} tools)` )
    return { name, client, tools }
  } catch (e) {
    const msg = (e as Error).message || String(e)
    debug?.(`MCP: failed to connect to ${name}: ${msg}`)
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

  let closed = false
  return {
    tools,
    status: () => ({
      servers: infos,
      toolCount: tools.length,
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

