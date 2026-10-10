// Config menu and config command messages.
export const configMessages: Record<string, { ru: string; en: string }> = {
  'cfg.group.ui': { ru: 'Интерфейс', en: 'Interface' },
  'cfg.group.agent': { ru: 'Агент', en: 'Agent' },
  'cfg.group.undo': { ru: 'Откат (undo)', en: 'Undo' },
  'cfg.group.checkpoint': { ru: 'Чекпойнты', en: 'Checkpoints' },
  'cfg.group.transcript': { ru: 'Транскрипт', en: 'Transcript' },
  'cfg.group.browser': { ru: 'Браузер / DeepSeek', en: 'Browser / DeepSeek' },

  'cfg.f.ui_contextLimit': {
    ru: 'Размер контекста (токены)',
    en: 'Context window (tokens)',
  },
  'cfg.f.ui_locale': {
    ru: 'Язык интерфейса и ответов агента',
    en: 'Interface and agent reply language',
  },
  'cfg.f.ui_answerWidth': {
    ru: 'Ширина контента в колонках: ответы, ввод, инструменты (0 — авто, до 100)',
    en: 'Content width in columns: answers, input, tools (0 = auto, capped at 100)',
  },
  'cfg.f.maxIterations': {
    ru: 'Лимит итераций на задачу',
    en: 'Max agent loop iterations per task',
  },
  'cfg.f.headless': {
    ru: 'Браузер без UI (нужен перезапуск)',
    en: 'Headless browser (needs restart)',
  },
  'cfg.f.debug': { ru: 'Подробный лог', en: 'Verbose debug logging' },
  'cfg.f.hotReload': {
    ru: 'Авто-перечитывание модулей перед задачей',
    en: 'Auto-reload logic modules before each task',
  },
  'cfg.f.undo_enabled': {
    ru: 'Включить бэкапы для отката',
    en: 'Enable undo backups',
  },
  'cfg.f.undo_maxBackups': {
    ru: 'Сколько бэкапов хранить',
    en: 'Max undo backups kept',
  },
  'cfg.f.checkpoint_enabled': {
    ru: 'Чекпойнт в начале каждой задачи (для /rewind)',
    en: 'Checkpoint at the start of each task (for /rewind)',
  },
  'cfg.f.checkpoint_maxBackups': {
    ru: 'Сколько чекпойнтов хранить',
    en: 'How many checkpoints to keep',
  },
  'cfg.f.transcript_enabled': {
    ru: 'Вести транскрипт',
    en: 'Write transcript log',
  },
  'cfg.f.browser_answerTimeoutMs': {
    ru: 'Ждать ответ, мс',
    en: 'Wait for an answer, ms',
  },
  'cfg.f.browser_askRetries': {
    ru: 'Число повторов ask()',
    en: 'ask() retry count',
  },
  'cfg.f.browser_stabilityChecks': {
    ru: 'Проверки стабильности ответа',
    en: 'Answer stability checks',
  },
  'cfg.f.browser_stabilityDelayMs': {
    ru: 'Пауза между проверками, мс',
    en: 'Delay between stability checks, ms',
  },
  'cfg.f.browser_minSendIntervalMs': {
    ru: 'Мин. пауза между отправками, мс',
    en: 'Min pause between sends, ms',
  },
  'cfg.f.browser_thinkingExtraMs': {
    ru: 'Доп. пауза в режиме размышления, мс',
    en: 'Extra pause in thinking mode, ms',
  },
  'cfg.f.browser_rateLimitWaitMs': {
    ru: 'Пауза при лимите частоты, мс',
    en: 'Wait on rate limit, ms',
  },
  'cfg.f.browser_maxRateLimitRetries': {
    ru: 'Число повторов при лимите',
    en: 'Rate-limit retry count',
  },
  'cfg.f.browser_maxIncompleteRetries': {
    ru: 'Повторы при обрыве ответа (Continue)',
    en: 'Retries when the answer is truncated (Continue)',
  },
  'cfg.f.browser_incompleteWaitMs': {
    ru: 'Пауза перед повтором после обрыва, мс',
    en: 'Wait before retrying a truncated turn, ms',
  },
  'cfg.f.browser_autoContinue': {
    ru: 'Автонажатие кнопки Continue (режим размышления)',
    en: 'Auto-click Continue (reasoning mode)',
  },
  'cfg.f.browser_autoCompact': {
    ru: 'Авто-сжатие контекста',
    en: 'Auto-compact the context',
  },
  'cfg.f.browser_autoCompactPct': {
    ru: 'Порог авто-сжатия (%)',
    en: 'Auto-compact threshold (%)',
  },
  'cfg.f.browser_askDeadlineMs': {
    ru: 'Watchdog-таймаут ask (мс)',
    en: 'ask() watchdog deadline (ms)',
  },
  'cfg.f.browser_maxAfterToolRetries': {
    ru: 'Повторов после таймаута',
    en: 'Retries after a timeout',
  },
  'cfg.f.browser_continueMinGapMs': {
    ru: 'Мин. пауза перед нажатием Continue, мс',
    en: 'Min gap before a Continue click, ms',
  },
  'cfg.f.browser_resendPromptOnResume': {
    ru: 'Пересылать системный промпт при возобновлении чата',
    en: 'Resend the system prompt on chat resume',
  },
  'cfg.f.browser_subagents': {
    ru: 'Субагенты: инструмент Task (отдельный чат)',
    en: 'Subagents: the Task tool (separate chat)',
  },
  'cfg.f.browser_maxSubagents': {
    ru: 'Максимум субагентов на задачу',
    en: 'Max subagents per task',
  },
  'cfg.f.browser_deepThinking': {
    ru: 'Глубокое мышление (долго; размышления не выводятся)',
    en: 'Deep thinking (slow; reasoning is hidden)',
  },
  'cfg.f.browser_webSearch': {
    ru: 'Умный поиск в интернете',
    en: 'Smart web search',
  },
  'cfg.f.browser_authUsername': {
    ru: 'Логин DeepSeek для авто-входа',
    en: 'DeepSeek login for auto sign-in',
  },
  'cfg.f.browser_authPassword': {
    ru: 'Пароль DeepSeek для авто-входа',
    en: 'DeepSeek password for auto sign-in',
  },
  'cfg.f.browser_authSaveSession': {
    ru: 'Сохранять сессию входа в профиле',
    en: 'Persist the login session in the profile',
  },

  'cfg.title': { ru: 'Настройки zames', en: 'zames settings' },
  'cfg.usage': {
    ru: 'Использование: /config [menu | list | get <путь> | set <путь> <значение> | reset <путь> | path | lang <ru|en>]',
    en: 'Usage: /config [menu | list | get <path> | set <path> <value> | reset <path> | path | lang <ru|en>]',
  },
  'cfg.saved': {
    ru: 'Сохранено: {v} = {value} ({file})',
    en: 'Saved: {v} = {value} ({file})',
  },
  'cfg.reset': { ru: 'Сброшено к дефолту: {v}', en: 'Reset to default: {v}' },
  'cfg.value': { ru: '{v} = {value}', en: '{v} = {value}' },
  'cfg.unknown_key': {
    ru: 'Неизвестный параметр: {v}',
    en: 'Unknown setting: {v}',
  },
  'cfg.bad_value': {
    ru: 'Неверное значение для {v}: ожидалось {type}',
    en: 'Invalid value for {v}: expected {type}',
  },
  'cfg.range_hint': {
    ru: 'число от {min} до {max}',
    en: 'a number from {min} to {max}',
  },
  'cfg.write_error': {
    ru: 'Не удалось записать конфиг: {v}',
    en: 'Failed to write config: {v}',
  },
  'cfg.paths': {
    ru: 'Конфиг (глобальный): {global}\nКонфиг (проект): {project}',
    en: 'Config (global): {global}\nConfig (project): {project}',
  },
  'cfg.lang_set': {
    ru: 'Язык переключён на {v}.',
    en: 'Language switched to {v}.',
  },
  'cfg.lang_usage': {
    ru: 'Использование: /config lang <ru|en>',
    en: 'Usage: /config lang <ru|en>',
  },
}
