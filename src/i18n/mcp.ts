// MCP server messages.
export const mcpMessages: Record<string, { ru: string; en: string }> = {
  'help.cmd.mcp': {
    ru: '/mcp                     MCP-серверы: число инструментов, ошибки и предупреждения',
    en: '/mcp                     MCP servers: tool count, errors and warnings',
  },
  'mcp.loaded': {
    ru: 'MCP: подключено инструментов {n} ({servers})',
    en: 'MCP: {n} tool(s) from {servers}',
  },
  'mcp.server_error': {
    ru: 'MCP-сервер {name} недоступен: {error}',
    en: 'MCP server {name} unavailable: {error}',
  },
  'mcp.load_failed': {
    ru: 'Не удалось загрузить MCP: {v}',
    en: 'Failed to load MCP: {v}',
  },
  'mcp.none': {
    ru: 'MCP-серверы не настроены.',
    en: 'No MCP servers configured.',
  },
  'mcp.hint': {
    ru: 'Добавь ~/.zames/mcp.json, <project>/.zames/mcp.json или <project>/.mcp.json.',
    en: 'Add ~/.zames/mcp.json, <project>/.zames/mcp.json or <project>/.mcp.json.',
  },
  'mcp.title': {
    ru: 'MCP-серверы (инструментов: {n}):',
    en: 'MCP servers ({n} tools):',
  },
  'mcp.floating': {
    ru: 'MCP-сервер «{v}» использует плавающую версию (@latest/@next); закрепите точную версию, чтобы набор инструментов не менялся между запусками.',
    en: 'MCP server "{v}" uses a floating version (@latest/@next); pin an exact version so the tool set does not change between runs.',
  },
  'mcp.status_error': { ru: '(ошибка: {v})', en: '(error: {v})' },
  'status.mcp': { ru: 'MCP-инструменты: {v}', en: 'MCP tools: {v}' },
  'status.toggles': {
    ru: 'Размышление: {think} · Поиск: {search}',
    en: 'Deep thinking: {think} · Search: {search}',
  },
  'status.tokens': {
    ru: 'Контекст (токенов): {v}',
    en: 'Context (tokens): {v}',
  },
}
