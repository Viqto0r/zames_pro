// MCP server messages.
export const mcpMessages: Record<string, { ru: string; en: string }> = {
  'help.cmd.mcp': {
    ru: '/mcp                     показать MCP-серверы и их инструменты',
    en: '/mcp                     show MCP servers and their tools',
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
    ru: 'Добавь ~/.zames/mcp.json или <project>/.zames/mcp.json.',
    en: 'Add ~/.zames/mcp.json or <project>/.zames/mcp.json.',
  },
  'mcp.title': {
    ru: 'MCP-серверы (инструментов: {n}):',
    en: 'MCP servers ({n} tools):',
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
