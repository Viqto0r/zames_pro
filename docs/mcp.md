# MCP (external tools)

How to plug external MCP tool servers into zames_pro. The README is a short overview.

## MCP (external tools)

zames can use tools from [MCP](https://modelcontextprotocol.io) servers.
The flagship example is @playwright/mcp: it gives the agent a real browser
(navigate, click, snapshot, type, ...) on top of the one zames already uses
for the DeepSeek, Qwen or GLM chat.

Drop a config file (same shape as Claude Code / Cursor):

- `~/.zames/mcp.json` - global
- `<project>/.zames/mcp.json` - project-scoped (later files win)
- `<project>/.mcp.json` - the common MCP name

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless", "--isolated"]
    }
  }
}
```

IMPORTANT: keep the MCP browser isolated. @playwright/mcp defaults to the
SAME profile directory as zames (~/.zames/profile). If it is launched
without --isolated (or without its own --user-data-dir), the MCP browser
and the agent browser fight over one profile and the DeepSeek chat shows
"Something went wrong when opening your profile". Always pass --isolated
as in the example above.
Servers can also be remote ("url": "https://...", "transport": "sse").
Their tools show up in the agent as `server__tool` (e.g.
`playwright__browser_navigate`) and are listed with `/mcp` and in `/status`.
A server that fails to connect is skipped with a warning and never breaks the
agent.

### Recommended servers (verified)

A few small, high-value servers tested end to end with zames (on the DeepSeek
and Qwen backends; the MCP layer is provider-agnostic, so they work with GLM
too):

- **Context7** (`@upstash/context7-mcp`) — fetches CURRENT, version-specific
  documentation for a library before the agent writes code, instead of relying
  on a stale training snapshot. Tools: `resolve_library_id` then `query_docs`.
  Verified live on DeepSeek AND Qwen: the agent called both tools and got the
  current Zod API. This is the one to add first.

  ```json
  {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
  ```

- **Sequential Thinking** (`@modelcontextprotocol/server-sequential-thinking`)
  — one `sequentialthinking` tool that gives the model an explicit, revisable
  plan before it acts; useful for long multi-step tasks.

- **Memory** (`@modelcontextprotocol/server-memory`) — a local knowledge graph
  (9 tools) for durable facts across chats. NOTE: zames already has `MEMORY.md`
  - `AGENTS.md`; add this only if you want a queryable graph.

Keep the stack SMALL: every server loads its tool definitions into the model's
context. Add one when you feel its absence, not before.
