// Config menu and config command messages.
export const configMessages: Record<string, { ru: string; en: string }> = {
  'cfg.group.ui': { ru: 'Интерфейс', en: 'Interface' },
  'cfg.group.agent': { ru: 'Агент', en: 'Agent' },
  'cfg.group.undo': { ru: 'Откат (undo)', en: 'Undo' },
  'cfg.group.checkpoint': { ru: 'Чекпойнты', en: 'Checkpoints' },
  'cfg.group.transcript': { ru: 'Транскрипт', en: 'Transcript' },
  'cfg.group.browser': { ru: 'Браузер / чат', en: 'Browser / chat' },
  'cfg.f.provider': { ru: 'Провайдер чата', en: 'Chat provider' },
  'cfg.f.qwen_model': {
    ru: 'Модель Qwen (id)',
    en: 'Qwen model (id)',
  },
  'cfg.f.glm_model': {
    ru: 'Модель GLM (id)',
    en: 'GLM model (id)',
  },
  'cfg.f.glm_contextLimit': {
    ru: 'GLM: размер контекста, токены',
    en: 'GLM: context window, tokens',
  },
  'cfg.f.glm_minSendIntervalMs': {
    ru: 'GLM: пауза между отправками (мс, 0 = адаптивно)',
    en: 'GLM: pause between sends (ms, 0 = adaptive)',
  },
  'cfg.f.glm_answerTimeoutMs': {
    ru: 'GLM: таймаут ответа (мс)',
    en: 'GLM: answer timeout (ms)',
  },
  'cfg.f.browser_sendTelemetry': {
    ru: 'Писать телеметрию отправок (пауза, флаги, исход; без промптов)',
    en: 'Write send telemetry (pause, flags, outcome; no prompts)',
  },
  'cfg.f.browser_loginTimeoutMs': {
    ru: 'Сколько ждать входа в окне браузера (мс)',
    en: 'How long to wait for a browser sign-in (ms)',
  },
  'cfg.f.qwen_contextLimit': {
    ru: 'Qwen: размер контекста, токены (258K у Qwen3-Max, 1M у 3.7/3.8/Coder)',
    en: 'Qwen: context window, tokens (258K on Qwen3-Max, 1M on 3.7/3.8/Coder)',
  },
  'cfg.f.qwen_minSendIntervalMs': {
    ru: 'Qwen: пауза между отправками (мс)',
    en: 'Qwen: pause between sends (ms)',
  },
  'cfg.f.qwen_answerTimeoutMs': {
    ru: 'Qwen: таймаут ответа (мс)',
    en: 'Qwen: answer timeout (ms)',
  },

  'cfg.f.ui_contextLimit': {
    ru: 'Размер контекста (токены)',
    en: 'Context window (tokens)',
  },
  'cfg.f.ui_locale': {
    ru: 'Язык интерфейса и ответов агента',
    en: 'Interface and agent reply language',
  },
  'cfg.f.ui_theme': {
    ru: 'Цветовая тема терминала',
    en: 'Terminal color theme',
  },
  'cfg.f.ui_answerWidth': {
    ru: 'Ширина контента в колонках: ответы, ввод, инструменты (0 — авто, до 100)',
    en: 'Content width in columns: answers, input, tools (0 = auto, capped at 100)',
  },
  'cfg.f.ui_tui': {
    ru: 'Современный TUI (Ink/React) для ввода и статуса',
    en: 'Modern TUI (Ink/React) for input and status',
  },
  'cfg.f.ui_alternateScreen': {
    ru: 'Полноэкранный режим TUI (альтернативный экран)',
    en: 'Full-screen TUI mode (alternate screen)',
  },
  'cfg.f.ui_mouseScroll': {
    ru: 'Колесо мыши: вкл (по умолчанию) — скроллит диалог, выделение через Shift; выкл — мышью владеет терминал (обычное выделение, колесо инертно)',
    en: 'Mouse wheel: on (default) — scrolls the dialog, select with Shift; off — the terminal owns the mouse (normal selection, wheel inert)',
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
  'cfg.f.qwen_authUsername': {
    ru: 'Логин Qwen для авто-входа',
    en: 'Qwen login for auto sign-in',
  },
  'cfg.f.qwen_authPassword': {
    ru: 'Пароль Qwen для авто-входа',
    en: 'Qwen password for auto sign-in',
  },
  'cfg.f.glm_authUsername': {
    ru: 'Логин GLM для авто-входа',
    en: 'GLM login for auto sign-in',
  },
  'cfg.f.glm_authPassword': {
    ru: 'Пароль GLM для авто-входа',
    en: 'GLM password for auto sign-in',
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
  // The project `.zamesrc.json` is merged AFTER the home config, so a key it
  // also sets silently wins — the operator sees "saved", then the old value
  // after a restart (a stale `ui.locale: en` looked like a lost setting).
  'cfg.shadowed': {
    ru: '⚠ Проектный конфиг {file} переопределяет: {keys} — после перезапуска будет его значение. Уберите эти ключи из проектного файла.',
    en: '⚠ The project config {file} overrides: {keys} — after a restart its value wins. Remove these keys from the project file.',
  },
  'cfg.lang_usage': {
    ru: 'Использование: /config lang <ru|en>',
    en: 'Usage: /config lang <ru|en>',
  },
  'cfg.provider_restart': {
    ru: '⚠ Провайдер изменится только после перезапуска (для смены на лету используйте /provider).',
    en: '⚠ Provider changes only after a restart (use /provider to switch live).',
  },
  'cfg.restart_required': {
    ru: 'Этот параметр применится после перезапуска.',
    en: 'This setting takes effect after a restart.',
  },
}
