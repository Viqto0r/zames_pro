// /doctor and /add-dir diagnostics.
export const doctorMessages: Record<string, { ru: string; en: string }> = {
  'doctor.title': { ru: 'Диагностика:', en: 'Doctor:' },
  'doctor.repo': { ru: 'репозиторий ({v})', en: 'repo ({v})' },
  'doctor.detached': { ru: 'detached', en: 'detached' },
  'doctor.not_repo': { ru: 'не репозиторий', en: 'not a repository' },
  'doctor.loaded': { ru: 'загружен', en: 'loaded' },
  'doctor.error': { ru: 'ошибка: {v}', en: 'error: {v}' },
  'doctor.unknown': { ru: 'неизвестно', en: 'unknown' },
  'doctor.bundled': { ru: 'встроенный chromium', en: 'bundled chromium' },
  'doctor.auth_saved': {
    ru: 'сессия сохранена (авто-вход готов)',
    en: 'session saved (auto re-login ready)',
  },
  'doctor.auth_none': { ru: 'нет сохранённой сессии', en: 'no saved session' },
  'doctor.clipboard_none': {
    ru: 'инструмент не найден (вставка картинок отключена)',
    en: 'no tool found (image paste disabled)',
  },
  'doctor.mcp': {
    ru: '{servers} сервер(ов), {tools} инструмент(ов)',
    en: '{servers} server(s), {tools} tool(s)',
  },
  'doctor.tokens': { ru: '{v} токенов', en: '{v} tokens' },
  'doctor.origin_ok': { ru: 'origin настроен', en: 'origin configured' },
  'doctor.origin_none': { ru: 'нет origin', en: 'no origin' },
  'doctor.send_pause': {
    ru: '{n}с между отправками агента',
    en: '{n}s between agent sends',
  },
  'doctor.ssh': { ru: 'SSH-подключение', en: 'SSH remote' },
  'doctor.local': { ru: 'локальный терминал', en: 'local terminal' },
  'doctor.ua_cached': {
    ru: 'UA закэширован (без перезапуска)',
    en: 'UA cached (no relaunch)',
  },
  'doctor.ua_not_cached': {
    ru: 'UA ещё не закэширован (первый запуск перезапустится один раз)',
    en: 'no cached UA yet (first start relaunches once)',
  },

  'adddir.usage': {
    ru: 'Использование: /add-dir <path>',
    en: 'Usage: /add-dir <path>',
  },
  'adddir.same': {
    ru: 'Это уже рабочая директория.',
    en: 'This is already the working directory.',
  },
  'msg.from_queue': { ru: '▶ Из очереди: ', en: '▶ From queue: ' },
  'msg.from_queue_batch': {
    ru: '▶ Из очереди ({n} сообщ.): ',
    en: '▶ From queue ({n} messages): ',
  },
  'msg.batch_joined': {
    ru: 'объединил {n} сообщений в одну задачу',
    en: 'merged {n} messages into one task',
  },
  'msg.queue_title': { ru: 'Очередь сообщений:', en: 'Pending messages:' },
  'msg.queue_empty': { ru: 'Очередь пуста.', en: 'The queue is empty.' },
  'msg.queue_cleared': { ru: 'Очередь очищена.', en: 'Queue cleared.' },
  'msg.queue_usage': {
    ru: 'Использование: /queue [clear]',
    en: 'Usage: /queue [clear]',
  },
  'msg.queue_cleared_hint': {
    ru: 'Очистить: /queue clear',
    en: 'Clear: /queue clear',
  },
  'msg.agent_error': { ru: '✖ Ошибка агента:', en: '✖ Agent error:' },
  'msg.tool_loop': {
    ru: 'Агент повторяет один и тот же вызов инструмента — переключаю на другой подход.',
    en: 'The agent keeps repeating the same tool call — switching it to a different approach.',
  },
  'msg.suspicious_stop': {
    ru: 'агент, похоже, остановился, не распознав вызов инструмента. Ответ сохранён в транскрипте (событие suspicious_final). Можно попросить продолжить или переотправить задачу.',
    en: 'the agent seems to have stopped without recognizing a tool call. The response is saved in the transcript (suspicious_final event). You can ask it to continue or resend the task.',
  },
  'msg.critical': { ru: 'Критическая ошибка:', en: 'Critical error:' },
  'msg.error': { ru: 'Ошибка:', en: 'Error:' },
  'msg.reloaded': {
    ru: 'Перезагружено модулей: {n}. Браузер и чат не тронуты.',
    en: 'Modules reloaded: {n}. Browser and chat untouched.',
  },
  'msg.not_dir': { ru: 'Не директория: {v}', en: 'Not a directory: {v}' },
  'prompt.review': { ru: 'REVIEW', en: 'REVIEW' },
  'msg.workdir_error': {
    ru: 'Не удалось определить рабочую директорию:',
    en: 'Failed to determine the working directory:',
  },
  'msg.browser_error': {
    ru: 'Не удалось запустить браузер:',
    en: 'Failed to launch the browser:',
  },
  'msg.open_chat_error': {
    ru: 'Не удалось открыть чат: {v}',
    en: 'Failed to open chat: {v}',
  },
  'msg.new_chat_error': {
    ru: 'Не удалось создать новый чат: {v}',
    en: 'Failed to create a new chat: {v}',
  },
  'msg.reload_start': {
    ru: 'Перечитываю модули логики...',
    en: 'Reloading logic modules...',
  },
  'msg.reload_partial': {
    ru: 'Часть модулей не перезагрузилась:',
    en: 'Some modules failed to reload:',
  },
  'msg.reload_done': {
    ru: 'Перезагружено модулей: {n}. Браузер и чат не тронуты.',
    en: 'Reloaded modules: {n}. Browser and chat untouched.',
  },
  'msg.reload_error': { ru: 'Ошибка reload:', en: 'Reload error:' },
  'msg.abort_gen_short': {
    ru: '⏹ Esc — прерываю генерацию...',
    en: '⏹ Esc — aborting generation...',
  },
  'msg.abort_tool_short': {
    ru: '⏹ Ctrl+C — прерываю текущий инструмент (ещё раз — стоп всему прогону)...',
    en: '⏹ Ctrl+C — aborting the current tool (press again to stop the whole run)...',
  },
  'msg.abort_ctrlc_short': {
    ru: '⏹ Ctrl+C — прерываю генерацию...',
    en: '⏹ Ctrl+C — aborting generation...',
  },
}
