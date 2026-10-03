// Localization (i18n).
//
// Goals:
//   * change the interface language (help, service messages);
//   * the agent's answer language — via the system-prompt;
//   * the agent's answer language for a plain language.
//
// Strategy: a single key->translation map. New keys are easy to add.
// Russian texts (ru) are the default, English (en) is the alternative.

export type Locale = 'ru' | 'en'

export const DEFAULT_LOCALE: Locale = 'ru'

export interface LocaleInfo {
  code: Locale
  name: string
  englishName: string
}

export const LOCALES: LocaleInfo[] = [
  { code: 'ru', name: 'Русский', englishName: 'Russian' },
  { code: 'en', name: 'English', englishName: 'English' },
]

export function isLocale(v: unknown): v is Locale {
  return v === 'ru' || v === 'en'
}

export function normalizeLocale(v: unknown): Locale {
  if (!v) return DEFAULT_LOCALE
  const s = String(v).trim().toLowerCase()
  if (s === 'ru' || s === 'russian' || s === 'русский') return 'ru'
  if (s === 'en' || s === 'english' || s === 'английский') return 'en'
  return DEFAULT_LOCALE
}

export type TranslateParams = Record<string, string | number>

// String catalog. Key -> { ru, en }. If a key is missing — we return the key itself.
const CATALOG: Record<string, { ru: string; en: string }> = {
  'app.tagline': {
    ru: 'агент поверх chat.deepseek.com через Playwright',
    en: 'coding agent over chat.deepseek.com via Playwright',
  },
  'common.yes': { ru: 'да', en: 'yes' },
  'common.no': { ru: 'нет', en: 'no' },
  'common.on': { ru: 'вкл', en: 'on' },
  'common.off': { ru: 'выкл', en: 'off' },
  'common.none': { ru: '(нет)', en: '(none)' },
  'common.unknown': { ru: 'неизвестно', en: 'unknown' },

  // ---------- help ----------
  'help.options': { ru: 'Опции CLI:', en: 'CLI options:' },
  'help.opt.dir': {
    ru: 'рабочая директория агента',
    en: 'agent working directory',
  },
  'help.opt.task': { ru: 'задача одной строкой', en: 'single-line task' },
  'help.opt.chat': {
    ru: 'продолжить существующий чат по id',
    en: 'resume an existing chat by id',
  },
  'help.opt.resume_last': {
    ru: 'вернуться в последний сохранённый чат',
    en: 'resume the last saved chat',
  },
  'help.opt.new_chat': {
    ru: 'начать новый чат (по умолчанию)',
    en: 'start a new chat (default)',
  },
  'help.opt.resend_prompt': {
    ru: 'дослать system-prompt в существующий чат',
    en: 'resend system-prompt into an existing chat',
  },
  'help.opt.max_iter': {
    ru: 'лимит итераций, 0 = без лимита ({n})',
    en: 'iteration limit, 0 = unlimited ({n})',
  },
  'help.opt.headless': {
    ru: 'браузер без UI (по умолчанию)',
    en: 'headless browser (default)',
  },
  'help.opt.headed': {
    ru: 'показать окно браузера (отладка/вход)',
    en: 'show the browser window (debug/sign-in)',
  },
  'help.opt.debug': { ru: 'подробный лог', en: 'verbose log' },
  'help.opt.calibrate': {
    ru: 'режим калибровки селекторов',
    en: 'selector calibration mode',
  },
  'help.opt.dev': {
    ru: 'режим разработки: авто-перечитывание модулей',
    en: 'dev mode: auto-reload modules',
  },
  'help.opt.version': { ru: 'показать версию', en: 'show version' },
  'help.opt.help': { ru: 'эта справка', en: 'this help' },
  'help.while_working': {
    ru: 'Пока агент работает:',
    en: 'While the agent is working:',
  },
  'help.key.queue': {
    ru: 'печать + Enter           поставить сообщение в очередь (уйдёт после текущей задачи)',
    en: 'type + Enter              queue a message (sent after the current task)',
  },
  'help.key.history': {
    ru: '↑ / ↓                    история введённых сообщений',
    en: '↑ / ↓                     input history',
  },
  'help.key.search': {
    ru: 'Ctrl+R                   поиск по истории (обратный)',
    en: 'Ctrl+R                    reverse-search the history',
  },
  'help.key.words': {
    ru: 'Ctrl+← / Ctrl+→          перемещение по словам',
    en: 'Ctrl+← / Ctrl+→           move by words',
  },
  'help.key.slash': {
    ru: '/ + Tab                  подсказка и автодополнение slash-команд',
    en: '/ + Tab                   slash-command hints and completion',
  },
  'help.key.newline': {
    ru: 'Ctrl+J / Ctrl+Enter      новая строка (Shift+Enter в терминалах с поддержкой)',
    en: 'Ctrl+J / Ctrl+Enter       new line (Shift+Enter in capable terminals)',
  },
  'help.key.backslash': {
    ru: '\\ + Enter                тоже новая строка',
    en: '\\ + Enter                also a new line',
  },
  'help.key.attach': {
    ru: 'Ctrl+Shift+V картинки      вставить изображение/файл (сохранится в tmp)',
    en: 'Ctrl+Shift+V image         paste an image/file (saved to tmp)',
  },
  'help.key.esc': {
    ru: 'Esc, Ctrl+C              прервать текущую генерацию',
    en: 'Esc, Ctrl+C               abort current generation',
  },
  'help.commands': { ru: 'Обычные команды:', en: 'Commands:' },
  'help.cmd.new': {
    ru: '/new, /clear             новый чат (сброс контекста)',
    en: '/new, /clear             new chat (reset context)',
  },
  'help.cmd.sessions': {
    ru: '/sessions                список сохранённых сессий',
    en: '/sessions                list saved sessions',
  },
  'help.cmd.resume_id': {
    ru: '/resume-id <id>          восстановить сессию по полному id',
    en: '/resume-id <id>          resume a session by full id',
  },
  'help.cmd.chats': {
    ru: '/chats                   список последних чатов DeepSeek',
    en: '/chats                   recent DeepSeek chats',
  },
  'help.cmd.resume': {
    ru: '/resume <n>              открыть чат №n из /chats',
    en: '/resume <n>              open chat #n from /chats',
  },
  'help.cmd.chat': {
    ru: '/chat                    показать текущий chat id',
    en: '/chat                    show current chat id',
  },
  'help.cmd.cd': {
    ru: '/cd <path>               сменить рабочую директорию',
    en: '/cd <path>               change working directory',
  },
  'help.cmd.pwd': {
    ru: '/pwd                     текущая директория',
    en: '/pwd                     current directory',
  },
  'help.cmd.status': {
    ru: '/status                  состояние сессии',
    en: '/status                  session state',
  },
  'help.cmd.reload': {
    ru: '/reload                  перечитать модули логики без перезапуска',
    en: '/reload                  hot-reload logic modules',
  },
  'help.cmd.undo': {
    ru: '/undo                    откатить последнюю запись/правку',
    en: '/undo                    revert the last write/edit',
  },
  'help.cmd.undo_list': {
    ru: '/undo-list               список того, что можно откатить',
    en: '/undo-list               list revertable changes',
  },
  'help.cmd.transcript': {
    ru: '/transcript              путь к файлу транскрипта',
    en: '/transcript              transcript file path',
  },
  'help.cmd.diff': {
    ru: '/diff [--staged] показать git diff',
    en: '/diff [--staged] show working tree git diff',
  },
  'help.cmd.cost': { ru: '/cost статистика сессии', en: '/cost session stats' },
  'help.cmd.export': {
    ru: '/export [file] выгрузить сессию в Markdown',
    en: '/export [file] export the session to Markdown',
  },
  'help.cmd.doctor': {
    ru: '/doctor диагностика установки и конфига',
    en: '/doctor diagnose install and config',
  },
  'help.cmd.permissions': {
    ru: '/permissions настройки подтверждений',
    en: '/permissions confirmation settings',
  },
  'help.cmd.add_dir': {
    ru: '/add-dir <path> проверить директорию',
    en: '/add-dir <path> validate a directory',
  },
  'help.cmd.review': {
    ru: '/review [focus] ревью незакоммиченных изменений',
    en: '/review [focus] review uncommitted changes',
  },
  'help.cmd.compact': {
    ru: '/compact сжать историю и открыть новый чат с резюме',
    en: '/compact compact the history and open a new chat with the summary',
  },
  'help.cmd.queue': {
    ru: '/queue [clear] показать/очистить очередь сообщений',
    en: '/queue [clear] list/clear the pending message queue',
  },
  'help.cmd.tasks': {
    ru: '/tasks список задач агента (TodoWrite)',
    en: '/tasks the agent task list (TodoWrite)',
  },
  'help.cmd.thinking': {
    ru: '/thinking [on|off] включить/выключить режим размышления (можно во время работы)',
    en: '/thinking [on|off] toggle Deep thinking (works while the agent is busy)',
  },
  'help.cmd.web': {
    ru: '/web [on|off] включить/выключить поиск в интернете (можно во время работы)',
    en: '/web [on|off] toggle Smart search (works while the agent is busy)',
  },
  'help.cmd.goal': {
    ru: '/goal [текст|clear] задать долгоживущую цель сессии',
    en: '/goal [text|clear] set a long-lived session goal',
  },
  'help.cmd.loop': {
    ru: '/loop <интервал> <задача> периодически повторять задачу (напр. 10m)',
    en: '/loop <interval> <task> repeat a task periodically (e.g. 10m)',
  },
  'help.cmd.cron': {
    ru: '/cron <выражение> <задача> запускать по расписанию (5 полей)',
    en: '/cron <expr> <task> schedule a task (5-field cron)',
  },
  'help.cmd.jobs': {
    ru: '/jobs [rm <id>|clear] список/удаление запланированных задач',
    en: '/jobs [rm <id>|clear] list/remove scheduled tasks',
  },
  'sched.loop_usage': {
    ru: 'Использование: /loop <интервал> <задача>, например /loop 10m проверь тесты',
    en: 'Usage: /loop <interval> <task>, e.g. /loop 10m check the tests',
  },
  'sched.cron_usage': {
    ru: 'Использование: /cron "<мин> <час> <день> <мес> <день недели>" <задача>',
    en: 'Usage: /cron "<min> <hour> <dom> <month> <dow>" <task>',
  },
  'sched.loop_too_short': {
    ru: 'Слишком часто: минимум {min} (троттлинг отправок 15с).',
    en: 'Too frequent: minimum {min} (the send throttle is 15s).',
  },
  'sched.added': {
    ru: '⏰ Задача #{id} добавлена ({when}): {task}',
    en: '⏰ Job #{id} added ({when}): {task}',
  },
  'sched.title': { ru: 'Запланированные задачи:', en: 'Scheduled jobs:' },
  'sched.none': { ru: 'Запланированных задач нет.', en: 'No scheduled jobs.' },
  'sched.fired': {
    ru: '⏰ Задача #{id} сработала: {task}',
    en: '⏰ Job #{id} fired: {task}',
  },
  'sched.cleared': { ru: 'Задачи очищены: {n}', en: 'Jobs cleared: {n}' },
  'sched.removed': { ru: 'Задача #{id} удалена.', en: 'Job #{id} removed.' },
  'sched.rm_usage': {
    ru: 'Использование: /jobs rm <id>',
    en: 'Usage: /jobs rm <id>',
  },
  'sched.remove_hint': {
    ru: 'Удалить: /jobs rm <id> · очистить всё: /jobs clear',
    en: 'Remove: /jobs rm <id> · clear all: /jobs clear',
  },
  'goal.set': { ru: '🎯 Цель сессии: {goal}', en: '🎯 Session goal: {goal}' },
  'goal.loaded': {
    ru: '🎯 Восстановлена цель сессии: {goal}',
    en: '🎯 Restored session goal: {goal}',
  },
  'goal.current': {
    ru: '🎯 Цель сессии: {goal}',
    en: '🎯 Session goal: {goal}',
  },
  'goal.none': {
    ru: 'Цель сессии не задана. /goal <текст>, /goal clear.',
    en: 'No session goal. /goal <text>, /goal clear.',
  },
  'goal.cleared': {
    ru: '🎯 Цель сессии очищена.',
    en: '🎯 Session goal cleared.',
  },
  'toggle.thinking': { ru: 'Размышление', en: 'Deep thinking' },
  'toggle.search': { ru: 'Поиск в интернете', en: 'Smart search' },
  'toggle.set': { ru: '{name}: {state}', en: '{name}: {state}' },
  'compact.auto_trigger': {
    ru: '🗜️ Контекст заполнен на {pct}% ({tokens} токенов) — сжимаю историю и открываю новый чат...',
    en: '🗜️ Context at {pct}% ({tokens} tokens) — compacting the history and opening a fresh chat...',
  },
  'compact.auto_same_chat': {
    ru: '🗜️ Сжатие не открыло новый чат (тот же id) — отключаю авто-сжатие до конца задачи, чтобы не зациклиться.',
    en: '🗜️ Compaction did not open a fresh chat (same id) — disabling auto-compact for the rest of the task to avoid a loop.',
  },
  'compact.start': {
    ru: '🗜️ Сжимаю историю чата (DeepSeek)...',
    en: '🗜️ Compacting the chat history (DeepSeek)...',
  },
  'compact.empty': {
    ru: 'Нечего сжимать: в чате ещё нет ответов.',
    en: 'Nothing to compact: the chat has no answers yet.',
  },
  'compact.summary_failed': {
    ru: 'Не удалось получить резюме от модели: {v}',
    en: 'Could not get the summary from the model: {v}',
  },
  'compact.summary_retry': {
    ru: 'Не удалось получить резюме ({v}). Повтор {attempt}/{max}...',
    en: 'Could not get the summary ({v}). Retry {attempt}/{max}...',
  },
  'compact.summary_fallback': {
    ru: 'Модель не смогла сделать резюме — переношу последние {v} сообщений диалога как есть.',
    en: 'The model could not produce a summary — carrying the last {v} messages over as-is.',
  },
  'compact.done': {
    ru: '✅ История сжата, открыт новый чат с резюме.',
    en: '✅ History compacted, a new chat with the summary is open.',
  },
  'compact.report': {
    ru: 'Резюме перенесено в новый чат ({chars} символов, токенов было ~{tokens}).',
    en: 'The summary was carried into the new chat ({chars} chars, ~{tokens} tokens before).',
  },
  'compact.no_chat': {
    ru: 'Чат ещё не создан — сжимать нечего.',
    en: 'No chat created yet — nothing to compact.',
  },
  'diff.not_repo': { ru: 'Не git-репозиторий.', en: 'Not a git repository.' },
  'export.done': { ru: 'Сессия выгружена: {v}', en: 'Session exported: {v}' },
  'export.outside': {
    ru: 'Путь вне рабочей директории.',
    en: 'Path is outside the working directory.',
  },
  'adddir.not_dir': {
    ru: 'Нет такой директории: {v}',
    en: 'No such directory: {v}',
  },
  'adddir.note': {
    ru: 'Директория существует: {v}. Песочница фиксируется при запуске.',
    en: 'Directory exists: {v}. The sandbox is fixed at startup.',
  },
  'help.cmd.config': {
    ru: '/config                  настройки: показать и изменить',
    en: '/config                  settings: view and edit',
  },
  'help.cmd.lang': {
    ru: '/config lang <ru|en>     сменить язык интерфейса и агента',
    en: '/config lang <ru|en>     switch UI and agent language',
  },
  'help.cmd.debug_dom': {
    ru: '/debug-dom               сохранить HTML страницы (для отладки)',
    en: '/debug-dom               dump page HTML (debug)',
  },
  'help.cmd.help': {
    ru: '/help, help              справка',
    en: '/help, help              this help',
  },
  'help.cmd.exit': {
    ru: '/exit, /quit, exit       выход',
    en: '/exit, /quit, exit       exit',
  },
  'skills.none': {
    ru: 'Навыки не найдены. Добавьте SKILL.md в .zames/skills/<имя>/ или ~/.zames/skills/.',
    en: 'No skills found. Add SKILL.md under .zames/skills/<name>/ or ~/.zames/skills/.',
  },
  'skills.title': { ru: 'Найдено навыков: {n}', en: 'Skills found: {n}' },
  'memory.agents': {
    ru: 'Инструкции (AGENTS.md):',
    en: 'Instructions (AGENTS.md):',
  },
  'memory.memory': { ru: 'Память (MEMORY.md):', en: 'Memory (MEMORY.md):' },
  'init.exists': {
    ru: 'AGENTS.md уже существует: {v}',
    en: 'AGENTS.md already exists: {v}',
  },
  'init.created': { ru: 'Создан {v}', en: 'Created {v}' },
  'init.analyzing': {
    ru: 'Изучаю проект и готовлю AGENTS.md...',
    en: 'Analyzing the project and preparing AGENTS.md...',
  },
  'init.done': {
    ru: 'AGENTS.md создан агентом: {v}',
    en: 'AGENTS.md created by the agent: {v}',
  },
  'init.failed': {
    ru: 'Не удалось создать AGENTS.md автоматически, записан базовый шаблон.',
    en: 'Could not create AGENTS.md automatically, wrote a basic template.',
  },
  'init.overwrite': {
    ru: 'AGENTS.md уже существует: {v} (используйте /init --force для перезаписи)',
    en: 'AGENTS.md already exists: {v} (use /init --force to overwrite)',
  },
  'help.cmd.skill': { ru: 'навык (SKILL.md)', en: 'skill (SKILL.md)' },
  'help.cmd.custom': { ru: 'пользовательская команда', en: 'custom command' },
  'help.cmd.skills': {
    ru: '/skills                  список найденных навыков',
    en: '/skills                  list discovered skills',
  },
  'help.cmd.memory': {
    ru: '/memory                  показать MEMORY.md и AGENTS.md',
    en: '/memory                  show MEMORY.md and AGENTS.md',
  },
  'help.cmd.init': {
    ru: '/init [--force]          изучить проект и создать AGENTS.md',
    en: '/init [--force]          analyze the project and create AGENTS.md',
  },
  'help.skills': {
    ru: 'Навыки и свои команды:',
    en: 'Skills and custom commands:',
  },
  'help.self_review': {
    ru: 'Самообзор (отладка агента):',
    en: 'Self-review (agent debugging):',
  },
  'help.self.review': {
    ru: '/self-review [фокус]     снять снапшот src/ и запустить ревью',
    en: '/self-review [focus]     snapshot src/ and run review',
  },
  'help.self.fix': {
    ru: '/self-fix <name> [фокус] вернуться в существующий снапшот и продолжить',
    en: '/self-fix <name> [focus] enter an existing snapshot and continue',
  },
  'help.self.done': {
    ru: '/self-done               выйти из режима ревью (вернуться в свою папку)',
    en: '/self-done               leave review mode (back to your dir)',
  },
  'help.self.list': {
    ru: '/self-list               список снапшотов',
    en: '/self-list               list snapshots',
  },
  'help.self.diff': {
    ru: '/self-diff <name>        различия между текущим src/ и снапшотом',
    en: '/self-diff <name>        diff between current src/ and snapshot',
  },
  'help.self.apply': {
    ru: '/self-apply <name>       применить снапшот к src/ (с бэкапом)',
    en: '/self-apply <name>       apply snapshot to src/ (with backup)',
  },
  'help.files': { ru: 'Файлы:', en: 'Files:' },
  'help.files.logs': { ru: 'Логи:', en: 'Logs:' },
  'help.files.undo': { ru: 'Undo:', en: 'Undo:' },
  'help.files.sessions': { ru: 'Сессии:', en: 'Sessions:' },
  'help.files.profile': { ru: 'Профиль:', en: 'Profile:' },
  'help.files.snapshots': { ru: 'Снапшоты:', en: 'Snapshots:' },
  'help.files.tmp': { ru: 'Временные:', en: 'Temp:' },
  'help.files.config': { ru: 'Конфиг:', en: 'Config:' },

  // ---------- spinner ----------
  'spinner.phrases': {
    ru: 'Анализирую запрос…|Изучаю контекст…|Планирую решение…|Обрабатываю данные…|Формулирую ответ…|Проверяю детали…|Собираю информацию…|Обдумываю варианты…|Структурирую мысли…|Готовлю решение…|Анализирую код…|Уточняю детали…|Выполняю вычисления…|Систематизирую данные…|Прорабатываю задачу…|Проверяю логику…|Оптимизирую подход…|Формирую выводы…',
    en: 'Analyzing the request…|Reviewing the context…|Planning the solution…|Processing the data…|Formulating the answer…|Checking the details…|Gathering information…|Weighing the options…|Structuring the thoughts…|Preparing the solution…|Analyzing the code…|Clarifying the details…|Running the computation…|Organizing the data…|Working through the task…|Verifying the logic…|Optimizing the approach…|Forming conclusions…',
  },
  'spinner.hint': { ru: 'Esc — стоп', en: 'Esc — stop' },
  'spinner.pause': {
    ru: '⏳ пауза {n}с перед отправкой',
    en: '⏳ pause {n}s before send',
  },
  'spinner.running_tool': {
    ru: '⚙ выполняю {name}',
    en: '⚙ running {name}',
  },
  // Send/generation lifecycle indicator in the status line. Unlike the
  // animated thinking phrase, it says explicitly that a generation is in
  // flight. 'paused'/'settled' have no label (see LineEditor._stateLabel).
  'state.generating': { ru: '▶ генерация', en: '▶ generating' },
  'editor.more': { ru: '…ещё {n}', en: '…{n} more' },
  'editor.answer': { ru: '● Ответ', en: '● Answer' },
  // Reverse search (Ctrl+R) status line. The query may be empty.
  'editor.search_prompt': {
    ru: '(обратный поиск) `{q}` — Ctrl+R дальше, Enter принять, Esc отмена',
    en: '(reverse-i-search) `{q}` — Ctrl+R next, Enter accept, Esc cancel',
  },
  'editor.search_fail': {
    ru: '(обратный поиск) `{q}` — не найдено, Esc отмена',
    en: '(reverse-i-search) `{q}` — not found, Esc cancel',
  },

  // ---------- status ----------
  'status.workdir': {
    ru: 'Рабочая директория: {v}',
    en: 'Working directory: {v}',
  },
  'status.review_mode': { ru: 'Режим ревью: {v}', en: 'Review mode: {v}' },
  'status.review_none': { ru: 'нет', en: 'no' },
  'status.orig_dir': {
    ru: 'Исходная директория: {v}',
    en: 'Original directory: {v}',
  },
  'status.chat': { ru: 'Текущий чат: {v}', en: 'Current chat: {v}' },
  'status.fresh_next': {
    ru: 'Fresh chat на след. задаче: {v}',
    en: 'Fresh chat next task: {v}',
  },
  'status.prompt_next': {
    ru: 'System prompt на след. задаче: {v}',
    en: 'System prompt next task: {v}',
  },
  'status.resend': {
    ru: 'Resend prompt (--resend-prompt): {v}',
    en: 'Resend prompt (--resend-prompt): {v}',
  },
  'status.last_chat': { ru: 'Last chat: {v}', en: 'Last chat: {v}' },
  'status.sessions': { ru: 'Сессии: {v}', en: 'Sessions: {v}' },
  'status.dev': {
    ru: 'Dev mode (auto-reload): {v}',
    en: 'Dev mode (auto-reload): {v}',
  },
  'status.max_iter': {
    ru: 'Лимит итераций: {v} (0 = без лимита)',
    en: 'Iteration limit: {v} (0 = unlimited)',
  },
  'status.headless': { ru: 'Headless: {v}', en: 'Headless: {v}' },
  'status.debug': { ru: 'Debug: {v}', en: 'Debug: {v}' },
  'status.undo': { ru: 'Undo: {v}', en: 'Undo: {v}' },
  'status.transcript': { ru: 'Транскрипт: {v}', en: 'Transcript: {v}' },
  'status.locale': { ru: 'Язык: {v}', en: 'Language: {v}' },
  'status.goal': { ru: 'Цель сессии: {v}', en: 'Session goal: {v}' },
  'status.tasks_summary': {
    ru: 'задачи: {done}/{total}',
    en: 'tasks: {done}/{total}',
  },

  // ---------- tasks (/tasks) ----------
  'tasks.title': { ru: 'Задачи агента:', en: 'Agent tasks:' },
  'tasks.empty': {
    ru: 'Список задач пуст (агент ещё не вызывал TodoWrite).',
    en: 'The task list is empty (the agent has not called TodoWrite yet).',
  },
  'tasks.restored': {
    ru: 'Восстановлен список задач: {done}/{total}',
    en: 'Task list restored: {done}/{total}',
  },

  // ---------- messages ----------
  'msg.working_dir': {
    ru: 'Рабочая директория: {v}',
    en: 'Working directory: {v}',
  },
  'msg.transcript': { ru: 'Транскрипт: {v}', en: 'Transcript: {v}' },
  'msg.new_chat': { ru: 'Создаю новый чат...', en: 'Creating a new chat...' },
  'msg.new_chat_ok': { ru: 'Новый чат.', en: 'New chat.' },
  'msg.resuming': {
    ru: 'Восстанавливаю сессию {id}...',
    en: 'Restoring session {id}...',
  },
  'msg.input_locked': {
    ru: 'Идёт операция, ввод временно заблокирован…',
    en: 'Operation in progress, input is temporarily locked…',
  },
  'msg.opening_chat': {
    ru: 'Открываю чат {id}...',
    en: 'Opening chat {id}...',
  },
  'msg.chat_opened': { ru: 'Чат открыт.', en: 'Chat opened.' },
  'msg.version': { ru: 'Версия: {v}', en: 'Version: {v}' },
  'msg.interactive': {
    ru: 'Интерактивный режим. Введите задачу. Команды — /help. Выход — /exit.',
    en: 'Interactive mode. Enter a task. Commands — /help. Exit — /exit.',
  },
  'msg.first_hint': {
    ru: 'Подсказка: «/» — список команд, Ctrl+R — поиск по истории, картинку можно вставить через Ctrl+Shift+V.',
    en: 'Hint: "/" lists commands, Ctrl+R searches history, paste an image with Ctrl+Shift+V.',
  },
  'msg.queue_hint': {
    ru: 'Пока агент работает, можно печатать следующее сообщение — оно уйдёт в очередь (Enter — отправить, Esc — прервать).',
    en: 'While the agent works you can type the next message — it goes to the queue (Enter — send, Esc — abort).',
  },
  'msg.unknown_cmd': {
    ru: 'Неизвестная команда: {v}. Набери /help.',
    en: 'Unknown command: {v}. Type /help.',
  },
  'msg.bye': { ru: 'Выход.', en: 'Bye.' },
  'msg.exit_summary': {
    ru: 'Транскрипт: {transcript} · чат: {chat}',
    en: 'Transcript: {transcript} · chat: {chat}',
  },
  'msg.abort_gen': {
    ru: '⏹ Esc — прерываю генерацию...',
    en: '⏹ Esc — aborting generation...',
  },
  'msg.abort_ctrlc': {
    ru: '⏹ Ctrl+C — прерываю генерацию...',
    en: '⏹ Ctrl+C — aborting generation...',
  },
  'msg.queued': { ru: '📨 В очередь ({n}): ', en: '📨 Queued ({n}): ' },
  // Shown ONCE per session, the first time a message is queued while the
  // agent is working. It explains what happens (sent after the current task)
  // and how to inspect/clear the queue, so the operator knows nothing is lost.
  'msg.queued_hint': {
    ru: 'Сообщение в очереди — уйдёт после текущей задачи; /queue покажет и очистит.',
    en: 'Message queued — it will be sent after the current task; /queue lists or clears it.',
  },
  'msg.attached_image': {
    ru: '🖼 Вложено изображение {marker} ({size}) — {path}',
    en: '🖼 Attached image {marker} ({size}) — {path}',
  },
  'msg.attached_file': {
    ru: '📎 Вложен файл {marker} {name} ({size}) — {path}',
    en: '📎 Attached file {marker} {name} ({size}) — {path}',
  },
  'msg.clip_empty': {
    ru: '⚠ В буфере обмена нет картинки (проверено: {via}).',
    en: '⚠ No image found in the clipboard (tried: {via}).',
  },
  'msg.clip_hint': {
    ru: '   Проще всего: вставьте путь к файлу (например tmp/pic.png) — файл приложится к сообщению. Для клипборда нужна утилита (Linux/X11 — xclip или xsel, Wayland — wl-clipboard; Windows — PowerShell, macOS — pngpaste).',
    en: '   Easiest: paste a path to a file (e.g. tmp/pic.png) — it will be attached to the message. Clipboard paste needs a tool (Linux/X11 — xclip or xsel, Wayland — wl-clipboard; Windows — PowerShell, macOS — pngpaste).',
  },
  'msg.clip_container': {
    ru: '   Похоже, вы в контейнере/Dev Container: клипборд Windows отсюда недоступен. Вставьте путь к файлу (например tmp/pic.png) — он приложится к сообщению.',
    en: '   Looks like a container/Dev Container: the Windows clipboard is not reachable from here. Paste a path to a file (e.g. tmp/pic.png) — it will be attached to the message.',
  },
  // Per-task summary parts (joined with "·" by index.ts). Split into separate
  // keys so the tokens part can be omitted when the counter is unknown.
  'task_sum.dur': { ru: 'длительность: {dur}', en: 'duration: {dur}' },
  'task_sum.tools': { ru: 'инструментов: {n}', en: 'tools: {n}' },
  'task_sum.tokens': { ru: 'токенов: {n}', en: 'tokens: {n}' },
  // Unit labels for the localized task duration (see formatDuration).
  'dur.h': { ru: 'ч', en: 'h' },
  'dur.m': { ru: 'м', en: 'm' },
  'dur.s': { ru: 'с', en: 's' },

  // ---------- /diff ----------
  'diff.no_changes': { ru: '(нет изменений)', en: '(no changes)' },
  'diff.more_lines': {
    ru: '... [{n} строк ещё, полный вывод — Bash git diff]',
    en: '... [{n} more lines, use Bash git diff for the full output]',
  },

  // ---------- /cost ----------
  'cost.title': { ru: 'Статистика сессии:', en: 'Session stats:' },
  'cost.context_known': {
    ru: ' контекст: ~{n} токенов (DeepSeek accumulated_token_usage)',
    en: ' context: ~{n} tokens (DeepSeek accumulated_token_usage)',
  },
  'cost.context_unknown': {
    ru: ' контекст: неизвестно (DeepSeek сообщит после первого ответа в чате)',
    en: ' context: unknown (DeepSeek reports it after the first answer in a chat)',
  },
  'cost.tasks': { ru: ' задач: {n}', en: ' tasks: {n}' },
  'cost.tool_calls': {
    ru: ' вызовов инструментов: {n}',
    en: ' tool calls: {n}',
  },
  'cost.auto_compacts': { ru: ' авто-сжатий: {n}', en: ' auto-compacts: {n}' },
  'cost.by_tool': { ru: ' по инструментам:', en: ' by tool:' },
  'cost.duration': { ru: ' длительность: {dur}', en: ' duration: {dur}' },
  'cost.started': { ru: ' начало: {v}', en: ' started: {v}' },
  'cost.transcript': { ru: ' транскрипт: {v}', en: ' transcript: {v}' },
  'cost.off': { ru: '(выкл)', en: '(off)' },

  // ---------- /doctor ----------
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

  // ---------- /permissions ----------
  'perm.title': {
    ru: 'Права инструментов (настройки подтверждений):',
    en: 'Tool permissions (confirmation settings):',
  },
  'perm.write': { ru: ' Write: {v}', en: ' Write: {v}' },
  'perm.edit': { ru: ' Edit: {v}', en: ' Edit: {v}' },
  'perm.bash': { ru: ' Bash: {v}', en: ' Bash: {v}' },
  'perm.ask': { ru: 'спрашивать', en: 'ask' },
  'perm.allow': { ru: 'разрешить', en: 'allow' },
  'perm.always': {
    ru: ' Всегда подтверждать (regex):',
    en: ' Always confirm (regex):',
  },
  'perm.change_hint': {
    ru: 'Изменить: /config set confirmation.write false (и .edit / .bash)',
    en: 'Change with: /config set confirmation.write false (and .edit / .bash)',
  },

  // ---------- /add-dir ----------
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
  'msg.suspicious_stop': {
    ru: 'агент, похоже, остановился, не распознав вызов инструмента. Ответ сохранён в транскрипте (событие suspicious_final). Можно попросить продолжить или переотправить задачу.',
    en: 'the agent seems to have stopped without recognizing a tool call. The response is saved in the transcript (suspicious_final event). You can ask it to continue or resend the task.',
  },
  'msg.critical': { ru: 'Критическая ошибка:', en: 'Critical error:' },
  'msg.error': { ru: 'Ошибка:', en: 'Error:' },
  'confirm.hint': {
    ru: 'всегда для этого типа',
    en: 'always for this kind',
  },
  'confirm.ask_label': { ru: 'Разрешить', en: 'Allow' },
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

  // ---------- DeepSeek-side problems (what is happening right now) ----------
  // The operator must understand WHY the agent is waiting or stopped: a rate
  // limit, a server hiccup, a refused send, a login problem. These strings are
  // printed around the moment they happen (browser.ts / agent-loop.ts), not as
  // a bare error at the end of the run.
  'ds.rate_limit_wait': {
    ru: '⏳ DeepSeek: «слишком часто». Жду {min} мин ({attempt}/{max}) и повторю отправку...',
    en: '⏳ DeepSeek: "too frequent". Waiting {min} min ({attempt}/{max}), then resending...',
  },
  'ds.rate_limit_give_up': {
    ru: '✖ DeepSeek не принял сообщение после {attempt} пауз по {min} мин. Подожди и попробуй снова.',
    en: '✖ DeepSeek refused the message after {attempt} waits of {min} min. Wait and try again.',
  },
  'ds.server_busy_wait': {
    ru: '⏳ DeepSeek: сервер занят. Жду {sec}с ({attempt}/{max}) и повторю...',
    en: '⏳ DeepSeek: server busy. Waiting {sec}s ({attempt}/{max}), then retrying...',
  },
  'ds.server_busy_give_up': {
    ru: '✖ DeepSeek: сервер не ответил после {attempt} повторов. Попробуй позже.',
    en: '✖ DeepSeek: the server did not respond after {attempt} retries. Try again later.',
  },
  'ds.ask_retry': {
    ru: '⚠ Отправка не удалась (попытка {attempt}/{max} на этот запрос): {error} — повторяю...',
    en: '⚠ Send failed (attempt {attempt}/{max} for this request): {error} — retrying...',
  },
  'ds.incomplete_retry': {
    ru: '⏳ DeepSeek оборвал ответ и кнопки Continue нет — переотправляю задачу ({attempt}/{max})...',
    en: '⏳ DeepSeek truncated the answer and there is no Continue button — resending the task ({attempt}/{max})...',
  },
  'ds.attach_read_failed': {
    ru: '⚠ не удалось прочитать вложение {name}: {error}',
    en: '⚠ could not read the attachment {name}: {error}',
  },
  'ds.attach_no_input': {
    ru: '⚠ не найдено поле загрузки файлов — вложения не прикреплены',
    en: '⚠ file upload field not found — the attachments were not attached',
  },
  'ds.attach_failed': {
    ru: '⚠ не удалось прикрепить файлы: {error}',
    en: '⚠ could not attach the files: {error}',
  },
  'ds.incomplete_give_up': {
    ru: '✖ DeepSeek {attempt} раз подряд оборвал ответ, не дойдя до конца. Возможно, включён режим размышления — попробуй выключить его (browser.deepThinking) или повтори позже.',
    en: '✖ DeepSeek truncated the answer {attempt} times in a row. The reasoning mode (deep thinking) may be on — try turning it off (browser.deepThinking) or retry later.',
  },
  'ds.ask_restart_browser': {
    ru: '⚠ Браузер потерял страницу — перезапускаю и вхожу заново...',
    en: '⚠ The browser lost the page — restarting and signing in again...',
  },
  'ds.ask_restart_failed': {
    ru: '⚠ Не удалось перезапустить браузер: {error}',
    en: '⚠ Could not restart the browser: {error}',
  },
  'ds.ask_failed': {
    ru: '✖ Не удалось получить ответ от DeepSeek после {max} попыток: {error}',
    en: '✖ Could not get an answer from DeepSeek after {max} attempts: {error}',
  },
  'ds.input_missing': {
    ru: '✖ Не найдено поле ввода на странице DeepSeek. Запусти /debug-dom и поправь INPUT_SELECTORS.',
    en: '✖ The DeepSeek input field was not found. Run /debug-dom and fix INPUT_SELECTORS.',
  },
  'ds.input_partial': {
    ru: '✖ Не удалось вставить текст в поле ввода целиком ({got} из {want} символов). Сообщение не отправлено, чтобы не отправить обрезанный текст. Попробуй ещё раз или разбей сообщение.',
    en: '✖ Could not paste the whole text into the input ({got} of {want} chars). The message was not sent to avoid sending a truncated text. Retry or split the message.',
  },
  'ds.send_no_start': {
    ru: '✖ Ответ не начал генерироваться за 35с даже после повторной отправки. Проверь чат DeepSeek вручную (возможно, кнопка отправки не нажимается или сессия разлогинилась).',
    en: '✖ The answer did not start generating within 35s even after resending. Check the DeepSeek chat manually (the send button may not be clickable or the session may have expired).',
  },
  'ds.send_no_new_answer': {
    ru: '✖ Новый ответ не получен — на странице остался прежний текст. Возможно, сообщение не отправилось. Проверь чат DeepSeek вручную.',
    en: '✖ No new answer received — the page still shows the previous text. The message may not have been sent. Check the DeepSeek chat manually.',
  },
  'ds.continue_clicked': {
    ru: '▶ Нажал «Continue» (DeepSeek приостановил вывод — возобновляю).',
    en: '▶ Clicked "Continue" (DeepSeek paused the output — resuming).',
  },
  'ds.answer_timeout': {
    ru: '⏳ DeepSeek не ответил за {sec}с ({attempt}/{max}) — повторяю запрос...',
    en: '⏳ DeepSeek did not answer within {sec}s ({attempt}/{max}) — retrying the request...',
  },
  'ds.answer_timeout_give_up': {
    ru: '✖ DeepSeek перестал отвечать, лимит повторов исчерпан. Модель не дала ответа — проверь чат DeepSeek вручную.',
    en: '✖ DeepSeek stopped responding, retry limit exhausted. The model gave no answer — check the DeepSeek chat manually.',
  },
  'ds.tool_retry': {
    ru: '⏳ Агент не распознал ответ модели — прошу продолжить ({attempt}/{max})...',
    en: '⏳ The agent did not recognize the model answer — asking it to continue ({attempt}/{max})...',
  },
  'ds.stalled': {
    ru: '⚠ Агент остановился, не завершив задачу (модель перестала вызывать инструменты). Проверь чат DeepSeek — задача может быть не выполнена.',
    en: '⚠ The agent stopped before finishing (the model stopped calling tools). Check the DeepSeek chat — the task may be incomplete.',
  },
  'ds.not_launched': {
    ru: '✖ Браузер не запущен.',
    en: '✖ The browser is not launched.',
  },
  'ds.open_chat_failed': {
    ru: '✖ Не удалось открыть чат {id}: {error}',
    en: '✖ Could not open chat {id}: {error}',
  },

  // ---------- self-review ----------
  'self.review_failed': {
    ru: 'Самообзор провалился:',
    en: 'Self-review failed:',
  },
  'self.fix_usage': {
    ru: 'Использование: /self-fix <name> [фокус]',
    en: 'Usage: /self-fix <name> [focus]',
  },
  'self.snapshot_not_found': {
    ru: 'Снапшот не найден: {v}',
    en: 'Snapshot not found: {v}',
  },
  'self.init_review_chat': {
    ru: 'Инициализирую review-чат для снапшота...',
    en: 'Initializing review chat for the snapshot...',
  },
  'self.enter_failed': {
    ru: 'Не удалось войти в снапшот:',
    en: 'Failed to enter the snapshot:',
  },
  'self.not_in_review': {
    ru: 'Ты и так не в режиме ревью.',
    en: 'You are not in review mode.',
  },
  'self.diff_usage': {
    ru: 'Использование: /self-diff <name>',
    en: 'Usage: /self-diff <name>',
  },
  'self.apply_usage': {
    ru: 'Использование: /self-apply <name>',
    en: 'Usage: /self-apply <name>',
  },
  'self.no_src': {
    ru: 'Самообзор отменён: в {dir} нет .ts файлов. Проверь, что src/ не пуст и ты запускаешь агента из корня проекта.',
    en: 'Self-review aborted: no .ts files in {dir}. Check that src/ is not empty and you run the agent from the project root.',
  },
  'self.no_src_err': {
    ru: 'SRC_DIR пуст — нечего ревьюить',
    en: 'SRC_DIR is empty - nothing to review',
  },
  'self.snapshot': { ru: '📸 Снапшот: {dir}', en: '📸 Snapshot: {dir}' },
  'self.files': { ru: 'Файлов: {n} — {list}', en: 'Files: {n} — {list}' },
  'self.starting': {
    ru: 'Начинаю самообзор...',
    en: 'Starting self-review...',
  },
  'self.report': { ru: '📋 Отчёт:', en: '📋 Report:' },
  'self.report_empty': { ru: '(пусто)', en: '(empty)' },
  'self.report_path': { ru: 'Отчёт:       {v}', en: 'Report:      {v}' },
  'self.snapshot_path': { ru: 'Снапшот:     {v}', en: 'Snapshot:    {v}' },
  'self.changed': {
    ru: 'Изменено:    {n} файл(ов): {list}',
    en: 'Changed:     {n} file(s): {list}',
  },
  'self.changed_none': {
    ru: 'Изменено:    (ничего — только отчёт)',
    en: 'Changed:     (nothing - report only)',
  },
  'self.next': { ru: 'Дальше:', en: 'Next:' },
  'self.diff_hint': {
    ru: '  /self-diff {name}   — посмотреть различия',
    en: '  /self-diff {name}   — view the diff',
  },
  'self.apply_hint': {
    ru: '  /self-apply {name}  — применить к живому src/',
    en: '  /self-apply {name}  — apply to the live src/',
  },
  'self.no_diff': { ru: 'Различий нет.', en: 'No differences.' },
  'self.apply_no_ts': {
    ru: 'В снапшоте {dir} нет .ts файлов. Apply отменён, чтобы не стирать src/.',
    en: 'Snapshot {dir} has no .ts files. Apply aborted to avoid wiping src/.',
  },
  'self.applied': {
    ru: '✅ Применено: {n} файл(ов)',
    en: '✅ Applied: {n} file(s)',
  },
  'self.backup': { ru: 'Бэкап: {dir}', en: 'Backup: {dir}' },
  'self.restart_hint': {
    ru: 'Перезапусти агента, чтобы изменения вступили в силу.',
    en: 'Restart the agent for the changes to take effect.',
  },
  'self.no_snapshots': { ru: 'Снапшотов нет.', en: 'No snapshots.' },
  'self.list_title': {
    ru: 'Снапшоты самообзора:',
    en: 'Self-review snapshots:',
  },
  'self.list_changed': { ru: '[{n} изменено]', en: '[{n} changed]' },
  'self.list_unchanged': { ru: '[без правок]', en: '[no changes]' },
  'self.list_commands': {
    ru: 'Команды: /self-diff <name>, /self-apply <name>',
    en: 'Commands: /self-diff <name>, /self-apply <name>',
  },
  'self.fix_hint': {
    ru: '\n💡 Режим ревью по снапшоту {name}. Пиши агенту задачу или /self-done.\n',
    en: '\n💡 Review mode on snapshot {name}. Send the agent a task or /self-done.\n',
  },
  'self.done_hint': {
    ru: 'Вернулся в {v}. Следующая задача начнёт новый чат.\n',
    en: 'Back to {v}. The next task will start a new chat.\n',
  },
  'self.review_hint': {
    ru: '\n💡 Теперь ты в режиме ревью. Просто пиши агенту, например:\n   «исправь ошибки»\n   «доработай обработку ошибок в ask()»\n   «покажи, что не так с undo»\nВыйти: /self-done.  Применить: /self-apply {name}\n',
    en: '\n💡 You are now in review mode. Just ask the agent, e.g.:\n   "fix the errors"\n   "improve error handling in ask()"\n   "show what is wrong with undo"\nExit: /self-done.  Apply: /self-apply {name}\n',
  },

  // ---------- chats / sessions ----------
  'chats.recent': {
    ru: 'Последние чаты DeepSeek:',
    en: 'Recent DeepSeek chats:',
  },
  'chats.use_resume': {
    ru: '\nИспользуй /resume <n> для продолжения.\n',
    en: '\nUse /resume <n> to continue.\n',
  },
  'chats.none': { ru: 'Чатов не найдено.', en: 'No chats found.' },
  'chats.none_hint': {
    ru: 'Чатов не найдено. Возможно, сайдбар свёрнут или селекторы устарели.',
    en: 'No chats found. The sidebar may be collapsed or the selectors are outdated.',
  },
  'chats.fetch_error': {
    ru: 'Не удалось получить список:',
    en: 'Failed to fetch the list:',
  },
  'chats.prompt_no_resend': {
    ru: ' Системный промпт НЕ пересылается (он уже в начале чата). Включить: /config set browser.resendPromptOnResume true.\n',
    en: ' The system prompt is NOT resent (it is already at the start of the chat). Enable: /config set browser.resendPromptOnResume true.\n',
  },
  'chats.resume_usage': {
    ru: 'Использование: /resume <n>  (или /chats для списка)',
    en: 'Usage: /resume <n>  (or /chats for the list)',
  },
  'chats.need_number': {
    ru: 'Нужен номер из /chats.',
    en: 'A number from /chats is required.',
  },
  'chats.run_chats_first': {
    ru: 'Сначала выполни /chats.',
    en: 'Run /chats first.',
  },
  'chats.no_n': {
    ru: 'Нет чата №{n}. Всего: {total}.',
    en: 'No chat #{n}. Total: {total}.',
  },
  'chats.opening': { ru: 'Открываю: {v}', en: 'Opening: {v}' },
  'chats.context_kept': {
    ru: ' Контекст чата сохранён. Системный промпт будет переслан на следующей задаче.\n',
    en: ' Chat context kept. The system prompt will be resent on the next task.\n',
  },
  'chats.prompt_will_resend': {
    ru: ' Системный промпт будет переслан на следующей задаче.\n',
    en: ' System prompt will be resent on the next task.\n',
  },
  'chats.current_id': {
    ru: 'Текущий chat id: {v}',
    en: 'Current chat id: {v}',
  },
  'chats.not_created': { ru: 'Чат ещё не создан.', en: 'No chat created yet.' },
  'chats.history_title': { ru: 'Диалог чата:', en: 'Chat dialogue:' },
  'chats.history_near_limit': {
    ru: '⚠ Контекст чата заполнен на {pct}% — рекомендую /compact.',
    en: '⚠ The chat context is {pct}% full — /compact is recommended.',
  },
  'chats.history_tokens': {
    ru: 'Контекст чата: ~{v} токенов',
    en: 'Chat context: ~{v} tokens',
  },
  'chats.history_empty': {
    ru: 'Диалог пуст или не удалось прочитать сообщения.',
    en: 'The dialogue is empty or the messages could not be read.',
  },
  'chats.history_service_only': {
    ru: 'В этом чате нет пользовательских реплик — только служебные сообщения агента (вызовы инструментов).',
    en: 'This chat has no user turns — only the agent service messages (tool calls).',
  },
  'chats.history_truncated': {
    ru: '… показаны последние {n} сообщений.',
    en: '… showing the last {n} messages.',
  },
  'chats.history_you': { ru: 'Вы', en: 'You' },
  'chats.history_agent': { ru: 'Агент', en: 'Agent' },
  'sessions.dir': { ru: 'Папка сессий: {v}', en: 'Sessions dir: {v}' },
  'sessions.none': {
    ru: 'Сохранённых сессий нет. Они появятся после первой задачи/чата.',
    en: 'No saved sessions. They appear after the first task/chat.',
  },
  'sessions.restore_hint': {
    ru: 'Восстановить: /resume-id <id>  (полный id) или /resume <n> после /chats.',
    en: 'Restore: /resume-id <id> (full id) or /resume <n> after /chats.',
  },
  'sessions.resume_id_usage': {
    ru: 'Использование: /resume-id <chat id>',
    en: 'Usage: /resume-id <chat id>',
  },

  // ---------- undo / dom ----------
  'undo.empty': { ru: 'История пуста.', en: 'History is empty.' },
  'undo.reverted': { ru: '↶ Откатили: {v}', en: '↶ Reverted: {v}' },
  'undo.restored': { ru: ' (восстановлено)', en: ' (restored)' },
  'undo.deleted': { ru: ' (удалено)', en: ' (deleted)' },
  'undo.failed': {
    ru: 'Не удалось откатить: {v}',
    en: 'Failed to revert: {v}',
  },
  'undo.changed': { ru: 'изменён', en: 'changed' },
  'undo.created': { ru: 'создан', en: 'created' },
  'dom.saved': { ru: 'HTML сохранён: {v}', en: 'HTML saved: {v}' },
  'dom.selectors': { ru: 'Селекторы:', en: 'Selectors:' },
  'dom.save_error': {
    ru: 'Не удалось сохранить DOM:',
    en: 'Failed to save DOM:',
  },

  // ---------- cd ----------
  'cd.outside': {
    ru: 'Нельзя выйти за пределы: {v}',
    en: 'Cannot leave the sandbox: {v}',
  },
  'cd.not_dir': { ru: 'Не директория: {v}', en: 'Not a directory: {v}' },
  'cd.already': { ru: 'Уже здесь.', en: 'Already here.' },
  'cd.left_review': {
    ru: 'Вышел из режима ревью (/cd).',
    en: 'Left review mode (/cd).',
  },
  'cd.changed': { ru: 'Рабочая директория: {v}', en: 'Working directory: {v}' },
  'cd.failed': {
    ru: 'Не удалось перейти: {v}',
    en: 'Failed to change directory: {v}',
  },

  calibrate: {
    ru: '\n🔧 Режим калибровки селекторов\n',
    en: '\n🔧 Selector calibration mode\n',
  },
  'reload.auto_partial': {
    ru: '⚠ авто-reload: часть модулей не загрузилась, работаю на прежней версии:',
    en: '⚠ auto-reload: some modules failed, using previous version:',
  },
  'reload.browser_restart': {
    ru: '⚠ browser.ts изменился, но он НЕ перезагружается на лету (в нём Playwright-контекст). Перезапусти zames, иначе изменения не применятся.',
    en: '⚠ browser.ts changed, but it is NOT hot-reloaded (it owns the Playwright context). Restart zames or the change will not apply.',
  },

  // ---------- MCP ----------
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
  // ---------- config menu ----------
  'cfg.group.ui': { ru: 'Интерфейс', en: 'Interface' },
  'cfg.group.agent': { ru: 'Агент', en: 'Agent' },
  'cfg.group.confirmation': { ru: 'Подтверждения', en: 'Confirmations' },
  'cfg.group.undo': { ru: 'Откат (undo)', en: 'Undo' },
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
  'cfg.f.confirmation_write': {
    ru: 'Спрашивать перед Write',
    en: 'Ask before Write',
  },
  'cfg.f.confirmation_edit': {
    ru: 'Спрашивать перед Edit',
    en: 'Ask before Edit',
  },
  'cfg.f.confirmation_bash': {
    ru: 'Спрашивать перед Bash',
    en: 'Ask before Bash',
  },
  'cfg.f.undo_enabled': {
    ru: 'Включить бэкапы для отката',
    en: 'Enable undo backups',
  },
  'cfg.f.undo_maxBackups': {
    ru: 'Сколько бэкапов хранить',
    en: 'Max undo backups kept',
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

  // ---------- login / auth ----------
  'auth.need_login': {
    ru: '🔐 Требуется вход в DeepSeek.',
    en: '🔐 DeepSeek sign-in required.',
  },
  'auth.prompt_login': {
    ru: 'Логин DeepSeek (телефон/email): ',
    en: 'DeepSeek login (phone/email): ',
  },
  'auth.prompt_password': {
    ru: 'Пароль DeepSeek: ',
    en: 'DeepSeek password: ',
  },
  'auth.prompt_password_saved': {
    ru: 'Пароль DeepSeek (Enter — использовать сохранённый): ',
    en: 'DeepSeek password (Enter — use the saved one): ',
  },
  'auth.auto_login': {
    ru: 'Авто-вход в DeepSeek...',
    en: 'Signing in to DeepSeek...',
  },
  'auth.auto_login_ok': { ru: 'Вход выполнен.', en: 'Signed in.' },
  'auth.auto_login_failed': {
    ru: 'Авто-вход не удался: {v}',
    en: 'Auto sign-in failed: {v}',
  },
  'auth.login_rejected': {
    ru: 'DeepSeek отклонил вход: {v}',
    en: 'DeepSeek rejected the sign-in: {v}',
  },
  'auth.form_not_found': {
    ru: 'Форма входа не распознана. Запустите с --headed и войдите вручную.',
    en: 'Login form not recognized. Run with --headed and sign in manually.',
  },
  'auth.no_reason': {
    ru: 'причина не определена (возможно, неверный логин/пароль или капча)',
    en: 'no reason detected (possibly wrong login/password or a captcha)',
  },
  'auth.manual_hint': {
    ru: 'Войдите в DeepSeek в открытом браузере, затем нажмите Enter.',
    en: 'Sign in to DeepSeek in the open browser, then press Enter.',
  },
  'auth.manual_hint_headless': {
    ru: 'Войдите в DeepSeek: откройте https://chat.deepseek.com/ в своём браузере. Если включён headless — задайте логин/пароль через /config или запустите с --headed.',
    en: 'Sign in to DeepSeek: open https://chat.deepseek.com/ in your browser. If headless is on — set the login/password via /config or run with --headed.',
  },
  'auth.session_saved': {
    ru: 'Сессия DeepSeek сохранена.',
    en: 'DeepSeek session saved.',
  },
  'auth.session_restored': {
    ru: 'Сессия DeepSeek восстановлена.',
    en: 'DeepSeek session restored.',
  },
  'auth.enter_to_continue': {
    ru: 'Нажмите Enter, чтобы продолжить...',
    en: 'Press Enter to continue...',
  },

  'cfg.menu.title': {
    ru: '⚙ Настройки — выбери параметр',
    en: '⚙ Settings — choose a parameter',
  },
  'cfg.menu.hint': {
    ru: '↑/↓ — выбор, Enter — изменить, q/Esc — выйти',
    en: '↑/↓ select, Enter edit, q/Esc quit',
  },
  'cfg.menu.edit_hint': {
    ru: 'Введи значение и Enter (пусто — отмена)',
    en: 'Enter a value and press Enter (empty — cancel)',
  },
  'cfg.menu.saved': {
    ru: '✔ Сохранено: {v} = {value}',
    en: '✔ Saved: {v} = {value}',
  },
  'cfg.menu.default': { ru: 'по умолчанию', en: 'default' },
  'cfg.menu.filter_hint': {
    ru: '/ — поиск по настройкам, d — сбросить (дважды), * — изменено от дефолта',
    en: '/ search settings, d reset (press twice), * changed from default',
  },
  'cfg.menu.filter_active': {
    ru: 'Фильтр: «{q}» (Esc/Enter — очистить)',
    en: 'Filter: "{q}" (Esc/Enter to clear)',
  },
  'cfg.menu.no_match': { ru: '(нет совпадений)', en: '(no matches)' },
  'cfg.menu.reset_confirm': {
    ru: 'Нажми d ещё раз, чтобы сбросить {v}',
    en: 'Press d again to reset {v}',
  },
  'cfg.menu.notty': {
    ru: 'Меню доступно только в интерактивном терминале. Используй /config list|get|set.',
    en: 'The menu needs an interactive terminal. Use /config list|get|set.',
  },
  // ---------- config ----------
  'cfg.title': { ru: 'Настройки zames', en: 'zames settings' },
  'cfg.current': { ru: 'Текущий конфиг:', en: 'Current config:' },
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
  'cfg.write_error': {
    ru: 'Не удалось записать конфиг: {v}',
    en: 'Failed to write config: {v}',
  },
  'cfg.paths': {
    ru: 'Конфиг (глобальный): {global}\nКонфиг (проект): {project}',
    en: 'Config (global): {global}\nConfig (project): {project}',
  },
  'cfg.keys': { ru: 'Доступные параметры:', en: 'Available settings:' },
  'cfg.lang_set': {
    ru: 'Язык переключён на {v}.',
    en: 'Language switched to {v}.',
  },
  'cfg.lang_usage': {
    ru: 'Использование: /config lang <ru|en>',
    en: 'Usage: /config lang <ru|en>',
  },
  'cfg.scope_current': {
    ru: 'Запись конфига: {v} ({file})',
    en: 'Config write scope: {v} ({file})',
  },
  'cfg.scope_usage': {
    ru: 'Использование: /config scope <project|home>. project = .zamesrc.json (в git), home = ~/.zames/. Для личных настроек (confirmations) выбери home, чтобы не коммитить их.',
    en: 'Usage: /config scope <project|home>. project = .zamesrc.json (committed), home = ~/.zames/. Use home for personal settings (confirmations) so they are not committed.',
  },
  'cfg.scope_set': {
    ru: 'Запись конфига: {v} ({file})',
    en: 'Config write scope: {v} ({file})',
  },
  'cfg.scope_bad': {
    ru: 'Неизвестный scope: {v}. Используй project или home.',
    en: 'Unknown scope: {v}. Use project or home.',
  },

  // ---------- system prompt ----------
  'prompt.answer_language': {
    ru: 'ВАЖНО: отвечай оператору на русском языке. Весь текст в поле message инструмента respond, а также любые пояснения — на русском.',
    en: 'IMPORTANT: reply to the operator in English. All text in the respond tool message field, and any explanations, must be in English.',
  },
  'prompt.tools_header': {
    ru: 'You have access to the following tools:',
    en: 'You have access to the following tools:',
  },
  // The hard "ONLY TOOL CALLS" block. All prose around a tool call is a
  // protocol violation: the operator never sees it (only tool calls and the
  // final respond reach the terminal), so it is pure pollution. We cannot
  // stop DeepSeek from generating it INSIDE its chat with code (that is the
  // model's output); we can only forbid it by prompt and hide it here.
  'prompt.only_tool_calls': {
    ru: '## ТОЛЬКО ВЫЗОВЫ ИНСТРУМЕНТОВ (жёсткое правило)\n\nОбщайся с оператором ТОЛЬКО через вызовы инструментов. Любой обычный текст — объяснения, планы, рассуждения, комментарии, извинения, приветствия, заголовки, списки, markdown, эмодзи — ЗАПРЕЩЁН. Он не читается и считается ошибкой.\n\nТВОЙ ЕДИНСТВЕННЫЙ ВЫВОД — вызов инструмента. В каждом ответе ровно один JSON-объект вызова (или массив независимых вызовов), без единого слова до и после.\n\nНЕЛЬЗЯ писать: «сейчас сделаю», «давай посмотрим», «проверю», планы, объяснения, итоги между шагами.\n\nМОЖНО только вызов инструмента и, в самом конце, когда задача выполнена, respond с итогом.\n\nЕдинственное место, где допускается текст, — поле message внутри respond, и только в самом конце.',
    en: '## ONLY TOOL CALLS (hard rule)\n\nTalk to the operator ONLY through tool calls. Any plain text — explanations, plans, reasoning, comments, apologies, greetings, headings, lists, markdown, emoji — is FORBIDDEN. It is not read and counts as an error.\n\nYOUR ONLY OUTPUT is a tool call. Each turn contains exactly one JSON tool-call object (or an array of independent calls), with not a single word before or after.\n\nYou MUST NOT write: "I will now...", "let us look...", "let me check", plans, explanations, progress notes between steps.\n\nALLOWED: only a tool call and, at the very end, when the task is done, respond with the summary.\n\nThe only place where text is allowed is the message field inside respond, and only at the very end.',
  },
}

export type TranslateFn = (key: string, params?: TranslateParams) => string

export function translate(locale: Locale): TranslateFn {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE
  return (key: string, params?: TranslateParams): string => {
    const entry = CATALOG[key]
    const template = entry ? entry[loc] || entry[DEFAULT_LOCALE] : key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (m, name) => {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : m
    })
  }
}

export function localeDisplayName(locale: Locale): string {
  const found = LOCALES.find((l) => l.code === locale)
  return found ? found.name : locale
}
