// Help text (CLI options, slash commands, key bindings).
export const helpMessages: Record<string, { ru: string; en: string }> = {
  'help.options': { ru: 'Опции CLI:', en: 'CLI options:' },
  'help.color_note': {
    ru: 'Цвет отключается переменной окружения NO_COLOR=1.',
    en: 'Disable color with the NO_COLOR=1 environment variable.',
  },
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
    ru: 'показать окно браузера (отладка/вход; GLM и так работает с окном)',
    en: 'show the browser window (debug/sign-in; GLM already runs headed)',
  },
  'help.opt.provider': {
    ru: 'выбрать провайдера чата на этот запуск (deepseek | qwen | glm; сохраняется в конфиг)',
    en: 'select the chat provider for this run (deepseek | qwen | glm; saved to the config)',
  },
  'help.opt.debug': { ru: 'подробный лог', en: 'verbose log' },
  'help.opt.dev': {
    ru: 'режим разработки: dev-команды, BACKLOG-заметки в промпте и авто-перечитывание модулей',
    en: 'dev mode: dev-only commands, BACKLOG notes in the prompt and module auto-reload',
  },
  'help.opt.version': { ru: 'показать версию', en: 'show version' },
  'help.opt.no_color': {
    ru: 'отключить цвет (то же, что NO_COLOR=1)',
    en: 'disable color (same as NO_COLOR=1)',
  },
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
    ru: '↑ / ↓                    история введённых сообщений (сохраняется в ~/.zames/history.json)',
    en: '↑ / ↓                     input history (saved to ~/.zames/history.json)',
  },
  'help.key.search': {
    ru: 'Ctrl+R                   поиск по истории ввода (обратный; Ctrl+R — дальше, Enter — принять, Esc — отмена)',
    en: 'Ctrl+R                    reverse search the input history (Ctrl+R next, Enter accept, Esc cancel)',
  },
  'help.key.undo': {
    ru: 'Ctrl+_                   отменить правку в строке ввода',
    en: 'Ctrl+_                    undo the last edit in the input line',
  },
  'help.key.words': {
    ru: 'Ctrl+← / Ctrl+→          перемещение по словам',
    en: 'Ctrl+← / Ctrl+→           move by words',
  },
  'help.key.slash': {
    ru: '/ + Tab                  подсказка и автодополнение slash-команд (Ctrl+N/P — выбор)',
    en: '/ + Tab                   slash-command hints and completion (Ctrl+N/P — select)',
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
    ru: 'Ctrl+V / пустая вставка    картинку/файл из буфера обмена в <project>/tmp (вставляется маркер)',
    en: 'Ctrl+V / empty paste       an image/file from the clipboard into <project>/tmp (a marker is inserted)',
  },
  'help.key.esc': {
    ru: 'Esc, Ctrl+C              Esc — прервать генерацию; Ctrl+C — прервать инструмент, второй раз (в 2с) — весь прогон; без задачи — выход',
    en: 'Esc, Ctrl+C               Esc — abort generation; Ctrl+C — abort the tool, twice (within 2s) — the whole run; idle — exit',
  },
  'help.key.scroll': {
    ru: 'PgUp / PgDn              вверх/вниз по диалогу на пол-экрана (Home/End — в начало/конец при пустом вводе) [full-screen]',
    en: 'PgUp / PgDn               half a screen up/down the dialog (Home/End — top/bottom with an empty input) [full-screen]',
  },
  'help.key.wheel': {
    ru: 'ui.mouseScroll            on (умолч.) — колесо скроллит диалог (выделение Shift); off — выделение мышью',
    en: 'ui.mouseScroll            on (default) — wheel scrolls the dialog (select: Shift); off — select with the mouse',
  },
  'help.key.bang': {
    ru: '!команда                  выполнить shell-команду напрямую, без модели (вывод в транскрипт)',
    en: '!command                  run a shell command directly, no model (output goes to the transcript)',
  },
  'help.commands': { ru: 'Команды:', en: 'Commands:' },
  'help.sec.session': { ru: 'Сессия', en: 'Session' },
  'help.sec.workspace': { ru: 'Рабочая директория', en: 'Workspace' },
  'help.sec.git': { ru: 'Git', en: 'Git' },
  'help.sec.agent': { ru: 'Агент', en: 'Agent' },
  'help.sec.context': { ru: 'Контекст и настройки', en: 'Context & settings' },
  'help.sec.provider': { ru: 'Провайдер чата', en: 'Chat provider' },
  'help.sec.files': { ru: 'Файлы и прочее', en: 'Files & misc' },
  'help.cmd.new': {
    ru: '/new, /clear             новый чат (сброс контекста)',
    en: '/new, /clear             new chat (reset context)',
  },
  'help.cmd.sessions': {
    ru: '/sessions [фильтр]        сохранённые сессии: фильтр по заголовку или каталогу (в TUI — выбор и открытие)',
    en: '/sessions [filter]        saved sessions: filter by title or workdir (the TUI opens the pick list)',
  },
  'help.cmd.resume_id': {
    ru: '/resume-id <id>          открыть сессию по полному id и напечатать диалог',
    en: '/resume-id <id>          open a session by full id and print its dialogue',
  },
  'help.cmd.chats': {
    ru: '/chats [фильтр]          последние чаты провайдера (в TUI — выбор и открытие, с диалогом)',
    en: '/chats [filter]          recent chats of the active provider (the TUI opens the pick list and prints the dialogue)',
  },
  'help.cmd.last': {
    ru: '/last                    открыть последний чат этого каталога и напечатать диалог',
    en: "/last                    open this directory's last chat and print its dialogue",
  },
  'help.cmd.chat': {
    ru: '/chat                    показать текущий chat id и его URL',
    en: '/chat                    show the current chat id and its URL',
  },
  'help.cmd.cd': {
    ru: '/cd <path>               сменить рабочую директорию (без аргумента — вернуться в корень; следующая задача начнёт новый чат)',
    en: '/cd <path>               change the working directory (no argument — back to the root; the next task starts a fresh chat)',
  },
  'help.cmd.pwd': {
    ru: '/pwd                     текущая директория',
    en: '/pwd                     current directory',
  },
  'help.cmd.status': {
    ru: '/status                  состояние сессии: каталог, чат, лимиты, пауза, флаги, MCP, токены',
    en: '/status                  session state: dir, chat, limits, pause, toggles, MCP, tokens',
  },
  'help.cmd.reload': {
    ru: '/reload                  перечитать модули логики (browser.ts и login — только после перезапуска)',
    en: '/reload                  hot-reload logic modules (browser.ts and login need a restart)',
  },
  'help.cmd.undo': {
    ru: '/undo                    откатить последнюю запись/правку',
    en: '/undo                    revert the last write/edit',
  },
  'help.cmd.undo_list': {
    ru: '/undo-list (/history)    список того, что можно откатить',
    en: '/undo-list (/history)    list revertable changes',
  },
  'help.cmd.rewind': {
    ru: '/rewind [n|<штамп>]     откатить рабочее дерево к чекпойнту (спросит подтверждение)',
    en: '/rewind [n|stamp]        roll the working tree back to a checkpoint (asks first)',
  },
  'help.cmd.rewind_list': {
    ru: '/rewind-list (/checkpoints) список чекпойнтов (штамп и каталог)',
    en: '/rewind-list (/checkpoints) list checkpoints (stamp and directory)',
  },
  'help.cmd.transcript': {
    ru: '/transcript              путь к файлу транскрипта',
    en: '/transcript              transcript file path',
  },
  'help.cmd.diff': {
    ru: '/diff [--staged] показать git diff (--staged — изменения в индексе)',
    en: '/diff [--staged] show git diff (--staged — staged changes)',
  },
  'help.cmd.diffstat': {
    ru: '/diffstat [--staged] сводка изменений (git diff --stat)',
    en: '/diffstat [--staged] change summary (git diff --stat)',
  },
  'help.cmd.retry': {
    ru: '/retry повторить последнюю задачу в этом чате (тот же чат, промпт не пересылается)',
    en: '/retry resend the last task into this chat (same chat, no prompt resend)',
  },
  'help.cmd.rename': {
    ru: '/rename <title> задать имя сессии в zames (чат на сайте не переименовывается)',
    en: '/rename <title> set the session title in zames (the web chat is not renamed)',
  },
  'help.cmd.context': {
    ru: '/context что загружено в промпт (AGENTS/MEMORY/skills/commands), размеры и объём промпта',
    en: '/context what the prompt loads (AGENTS/MEMORY/skills/commands), their sizes and the prompt size',
  },
  'help.cmd.copy': {
    ru: '/copy скопировать последний ответ в буфер обмена (нужна утилита: wl-copy/xclip/xsel, pbcopy, clip)',
    en: '/copy copy the last answer to the clipboard (needs a clipboard tool: wl-copy/xclip/xsel, pbcopy, clip)',
  },
  'help.cmd.cost': {
    ru: '/cost (/usage) статистика сессии: задачи, инструменты, время, контекст',
    en: '/cost (/usage) session stats: tasks, tools, time, context',
  },
  'help.cmd.limits': {
    ru: '/limits                  статистика отправок, лимитов и текущая пауза',
    en: '/limits                  send, rate-limit and current-pause stats',
  },
  'help.cmd.export': {
    ru: '/export [file] выгрузить сессию в Markdown (по умолчанию zames-export-<время>.md)',
    en: '/export [file] export the session to Markdown (default zames-export-<stamp>.md)',
  },
  'help.cmd.doctor': {
    ru: '/doctor диагностика: node, git, конфиг, браузер, буфер обмена, MCP, провайдер',
    en: '/doctor diagnose node, git, config, browser, clipboard, MCP and the provider',
  },
  'help.cmd.add_dir': {
    ru: '/add-dir <path> проверить директорию (только проверка — песочницу не меняет)',
    en: '/add-dir <path> validate a directory (check only — the sandbox is unchanged)',
  },
  'help.cmd.review': {
    ru: '/review [фокус] [--staged] ревью изменений агентом (без правок; --staged — индекс)',
    en: '/review [focus] [--staged] agent review of the changes (no edits; --staged — the index)',
  },
  'help.cmd.improve': {
    ru: '/improve [id] взять следующий пункт BACKLOG и довести до тестов',
    en: '/improve [id] take the next BACKLOG item and drive it to green tests',
  },
  'improve.no_backlog': {
    ru: 'BACKLOG.md не найден в рабочей директории.',
    en: 'BACKLOG.md was not found in the working directory.',
  },
  'improve.all_done': {
    ru: 'Открытых пунктов в BACKLOG нет.',
    en: 'There are no open BACKLOG items.',
  },
  'improve.not_found': {
    ru: 'Пункт {v} не найден в BACKLOG.',
    en: 'Item {v} was not found in BACKLOG.',
  },
  'improve.start': {
    ru: 'Улучшение {id}: {title}',
    en: 'Improving {id}: {title}',
  },
  'improve.collapsed': {
    ru: 'BACKLOG свёрнут: удалено архивных блоков — {n}.',
    en: 'BACKLOG collapsed: {n} archived block(s) removed.',
  },
  'help.cmd.backlog': {
    ru: '/backlog <текст> записать идею в BACKLOG.md (collapse — свернуть архив)',
    en: '/backlog <text> record an idea in BACKLOG.md (collapse — prune archive)',
  },
  'backlog.usage': {
    ru: 'Использование: /backlog <текст идеи>',
    en: 'Usage: /backlog <idea text>',
  },
  'backlog.none': {
    ru: 'BACKLOG.md не найден в рабочей директории.',
    en: 'BACKLOG.md was not found in the working directory.',
  },
  'backlog.adding': {
    ru: 'Записываю в BACKLOG: {v}',
    en: 'Recording in BACKLOG: {v}',
  },
  'backlog.warn': {
    ru: 'BACKLOG.md разросся ({lines} строк, {chars} символов). Сверни сделанное: /backlog collapse',
    en: 'BACKLOG.md has grown large ({lines} lines, {chars} chars). Collapse it: /backlog collapse',
  },
  'backlog.empty': {
    ru: 'Свёртывать нечего: архивных блоков нет.',
    en: 'Nothing to collapse: there are no archived blocks.',
  },
  'help.cmd.compact': {
    ru: '/compact сжать историю в резюме и продолжить в НОВОМ чате (старый остаётся)',
    en: '/compact summarize the history and continue in a NEW chat (the old one stays)',
  },
  'help.cmd.queue': {
    ru: '/queue [clear] очередь сообщений, ждущих отправки: показать / очистить (можно во время работы)',
    en: '/queue [clear] messages waiting to be sent: list / clear (works while the agent is busy)',
  },
  'help.cmd.tasks': {
    ru: '/tasks текущий чек-лист агента (TodoWrite): статусы шагов (можно во время работы)',
    en: "/tasks the agent's current checklist (TodoWrite): step statuses (works while the agent is busy)",
  },
  'help.cmd.thinking': {
    ru: '/thinking [on|off] режим размышления: DeepSeek/Qwen — тумблер, GLM — всегда включён (можно во время работы)',
    en: '/thinking [on|off] reasoning mode: a toggle on DeepSeek/Qwen, always on for GLM (works while busy)',
  },
  'help.cmd.web': {
    ru: '/web [on|off] поиск в интернете: DeepSeek — «Smart search», Qwen — пункт «Web search» (можно во время работы)',
    en: '/web [on|off] web search: DeepSeek "Smart search", Qwen the "Web search" menu item (works while busy)',
  },
  'help.cmd.goal': {
    ru: '/goal <условие> задать цель (работает, пока не выполнена; clear — снять, без аргумента — показать)',
    en: '/goal <condition> set the goal (runs until met; clear — drop, no argument — show it)',
  },
  'help.cmd.plan': {
    ru: '/plan [on|off] режим плана (чтение без правок); без аргумента — переключить',
    en: '/plan [on|off] plan mode (read-only); no argument toggles it',
  },
  'plan.on': {
    ru: 'Режим плана ВКЛ: доступны только инструменты чтения. Правки и команды запрещены. /plan off — выключить.',
    en: 'Plan mode ON: only read tools are available. Edits and commands are disabled. /plan off to disable.',
  },
  'plan.off': {
    ru: 'Режим плана ВЫКЛ: агент снова может писать и запускать команды.',
    en: 'Plan mode OFF: the agent can edit and run commands again.',
  },
  'help.opt.output_format': {
    ru: 'события в stdout как JSON-строки (json|jsonl; человеческий текст — в stderr)',
    en: 'events on stdout as JSON lines (json|jsonl; human text goes to stderr)',
  },
  'help.opt.plan': {
    ru: 'стартовать в режиме плана (только чтение)',
    en: 'start in plan mode (read-only)',
  },
  'help.cmd.loop': {
    ru: '/loop <интервал> <задача> повторять задачу (s/m/h; без единицы — секунды; первый запуск сразу; минимум 15с)',
    en: '/loop <interval> <task> repeat a task (s/m/h; no unit means seconds; the first run is immediate; minimum 15s)',
  },
  'help.cmd.cron': {
    ru: '/cron "<мин> <час> <день> <мес> <дow>" <задача> запуск по расписанию (5 полей; первый — только после наступления времени)',
    en: '/cron "<min> <hour> <dom> <month> <dow>" <task> schedule a task (5 fields; the first run waits for the schedule)',
  },
  'help.cmd.jobs': {
    ru: '/jobs [rm <id>|clear] список запланированных задач; rm <id> — удалить, clear — снять все',
    en: '/jobs [rm <id>|clear] list scheduled jobs; rm <id> removes one, clear removes all',
  },
  'sched.loop_usage': {
    ru: 'Использование: /loop <интервал> <задача>, например /loop 10m проверь тесты',
    en: 'Usage: /loop <interval> <task>, e.g. /loop 10m check the tests',
  },
  'sched.cron_usage': {
    ru: 'Использование: /cron "<мин> <час> <день> <мес> <день недели>" <задача>',
    en: 'Usage: /cron "<min> <hour> <dom> <month> <dow>" <task>',
  },
  'sched.interval_typo': {
    ru: 'Интервал «{v}» не распознан — задача НЕ добавлена. Единицы: s/sec, m/min, h (например, /loop 10m проверь тесты). Без единицы — СЕКУНДЫ (120 = 120с), для минут нужен суффикс m.',
    en: 'Interval "{v}" was not recognized — NO job was added. Units: s/sec, m/min, h (e.g. /loop 10m run the tests). Without a unit it means SECONDS (120 = 120s); use the m suffix for minutes.',
  },
  'sched.loop_too_short': {
    ru: 'Слишком часто: минимум {min} (троттлинг отправок 15с).',
    en: 'Too frequent: minimum {min} (the send throttle is 15s).',
  },
  'sched.added': {
    ru: '⏰ Задача #{id} добавлена ({when}): {task}',
    en: '⏰ Job #{id} added ({when}): {task}',
  },
  'sched.added_hint': {
    ru: 'Если агент свободен — запуск сразу, иначе сразу после текущей задачи; дальше — по расписанию. Список — /jobs, удалить — /jobs rm <id>.',
    en: 'Runs at once if the agent is idle, otherwise right after the current task; then on schedule. List: /jobs, remove: /jobs rm <id>.',
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
  'goal.met': {
    ru: '✅ Цель достигнута — цель снята автоматически. {reason}',
    en: '✅ Goal met — goal cleared automatically. {reason}',
  },
  'goal.impossible': {
    ru: '⛔ Цель недостижима — снята. {reason}',
    en: '⛔ Goal judged impossible — cleared. {reason}',
  },
  'goal.progress': {
    ru: '◷ Цель пока не достигнута: {reason}',
    en: '◷ Goal not yet met: {reason}',
  },
  'goal.turn_budget': {
    ru: '⏹️ Цель остановлена после {n} авто-ходов (лимит). Уточните условие или /goal clear.',
    en: '⏹️ Goal stopped after {n} auto-turns (budget). Refine the condition or /goal clear.',
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
    ru: '🗜️ Сжимаю историю чата ({provider})...',
    en: '🗜️ Compacting the chat history ({provider})...',
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
    ru: 'Директория существует: {v}. Только проверка — песочница фиксируется при запуске, доступ не расширяется (перезапустите с --dir, чтобы работать там).',
    en: 'Directory exists: {v}. Check only — the sandbox is fixed at startup, access is NOT granted (relaunch with --dir to work there).',
  },
  'help.cmd.config': {
    ru: '/config [list|get|set|reset|path|lang] настройки: меню или подкоманды (пишет в домашний конфиг)',
    en: '/config [list|get|set|reset|path|lang] settings: menu or subcommands (writes the home config)',
  },
  'help.cmd.lang': {
    ru: '/config lang <ru|en>     сменить язык интерфейса и агента',
    en: '/config lang <ru|en>     switch UI and agent language',
  },
  'help.cmd.provider': {
    ru: '/provider <id> | status | login — сменить бэкенд (сразу), показать состояние или повторить вход',
    en: '/provider <id> | status | login — switch the backend (live), show the state or re-run the sign-in',
  },
  'help.cmd.model': {
    ru: '/model [id]              список моделей или выбор по id (Qwen/GLM; в TUI — список выбора)',
    en: '/model [id]              list models or pick one by id (Qwen/GLM; the TUI shows a pick list)',
  },
  'help.cmd.debug_dom': {
    ru: '/debug-dom               сохранить HTML страницы и найденные селекторы в ~/.zames/logs',
    en: '/debug-dom               dump page HTML and matched selectors to ~/.zames/logs',
  },
  'help.no_topic': {
    ru: 'Нет команды по запросу «{v}». Попробуй /help без аргумента.',
    en: 'No command matches "{v}". Try /help without arguments.',
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
  'remember.usage': {
    ru: 'Использование: /remember <текст заметки>',
    en: 'Usage: /remember <note text>',
  },
  'remember.saved': {
    ru: '🧠 Заметка добавлена в {v}',
    en: '🧠 Note appended to {v}',
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
    ru: '/skills                  список навыков: имя, источник, описание, путь',
    en: '/skills                  list skills: name, source, description, path',
  },
  'help.cmd.memory': {
    ru: '/memory                  какие AGENTS.md и MEMORY.md реально загружены (пути)',
    en: '/memory                  which AGENTS.md and MEMORY.md are loaded (paths)',
  },
  'help.cmd.remember': {
    ru: '/remember <текст>        дописать заметку в MEMORY.md проекта (создаст файл)',
    en: '/remember <text>         append a note to the project MEMORY.md (creates it)',
  },
  'help.cmd.init': {
    ru: '/init [--force]          агент изучит проект и напишет AGENTS.md (--force — перезаписать)',
    en: '/init [--force]          the agent explores the repo and writes AGENTS.md (--force — overwrite)',
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
  'help.files.checkpoints': { ru: 'Чекпойнты:', en: 'Checkpoints:' },
  'help.files.sessions': { ru: 'Сессии:', en: 'Sessions:' },
  'help.files.profile': { ru: 'Профиль:', en: 'Profile:' },
  'help.files.snapshots': { ru: 'Снапшоты:', en: 'Snapshots:' },
  'help.files.tmp': { ru: 'Временные:', en: 'Temp:' },
  'help.files.tmp_note': {
    ru: '(в .gitignore, очищается при старте)',
    en: '(.gitignore, cleaned on start)',
  },
  'help.files.config': { ru: 'Конфиг:', en: 'Config:' },
  'help.toggles_legend': {
    ru: 'Индикаторы в статус-строке: 🧠 — глубокое размышление, 🌐 — поиск в интернете (видны, когда включены).',
    en: 'Status-line icons: 🧠 — Deep thinking, 🌐 — web search (shown when enabled).',
  },

  // Localized descriptions for the WELL-KNOWN skills (built-in + bundled
  // methodology). A skill's SKILL.md frontmatter is agent-facing English, so
  // showing it verbatim in the «/» hints would leave an English line in a
  // Russian UI. Keyed by skill NAME, applied regardless of source, so a local
  // `.zames/skills/` copy of a bundled skill still shows the translated text.
  // An unknown (user-authored) skill has no key and keeps its own description.
  'skill.desc.commit': {
    ru: 'подготовить аккуратный git-коммит из текущих изменений',
    en: 'prepare a clean git commit from the current changes',
  },
  'skill.desc.review': {
    ru: 'ревью текущего диффа на баги и риски (без правок)',
    en: 'review the current diff for bugs and risks (no changes)',
  },
  'skill.desc.test': {
    ru: 'прогнать тесты проекта и чинить падения до зелёного',
    en: 'run the project tests and fix failures until green',
  },
  'skill.desc.debug': {
    ru: 'системно диагностировать и починить баг',
    en: 'systematically diagnose and fix a bug',
  },
  'skill.desc.explain': {
    ru: 'объяснить, как работает файл/модуль/фича',
    en: 'explain how a file/module/feature works',
  },
  'skill.desc.brainstorming': {
    ru: 'когда запрос — это цель, а не спека: сначала прояснить замысел',
    en: 'when the request is a goal, not a spec: pin down the intent first',
  },
  'skill.desc.writing-plans': {
    ru: 'разбить многошаговую задачу на маленькие шаги с проверкой каждого',
    en: 'break a multi-step task into small steps, each with a check',
  },
  'skill.desc.test-driven-development': {
    ru: 'сначала падающий тест, потом код (RED → GREEN → REFACTOR)',
    en: 'write the failing test first, then the code (RED → GREEN → REFACTOR)',
  },
  'skill.desc.systematic-debugging': {
    ru: 'четыре фазы отладки: воспроизвести, изолировать, гипотеза, фикс',
    en: 'four debugging phases: reproduce, isolate, hypothesize, fix',
  },
  'skill.desc.verification-before-completion': {
    ru: 'прогнать проверку ПЕРЕД тем, как объявить задачу готовой',
    en: 'run the verification BEFORE declaring the task done',
  },
}
