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
    ru: 'показать окно браузера (отладка/вход)',
    en: 'show the browser window (debug/sign-in)',
  },
  'help.opt.debug': { ru: 'подробный лог', en: 'verbose log' },
  'help.opt.dev': {
    ru: 'режим разработки: авто-перечитывание модулей',
    en: 'dev mode: auto-reload modules',
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
    ru: '↑ / ↓                    история введённых сообщений',
    en: '↑ / ↓                     input history',
  },
  'help.key.search': {
    ru: 'Ctrl+R                   поиск по истории (обратный)',
    en: 'Ctrl+R                    reverse-search the history',
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
    ru: '/ + Tab                  подсказка и автодополнение slash-команд (Ctrl+N/P — листать)',
    en: '/ + Tab                   slash-command hints and completion (Ctrl+N/P to page)',
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
  'help.key.bang': {
    ru: '!команда                  выполнить shell-команду напрямую (мимо модели)',
    en: '!command                  run a shell command directly (bypass the model)',
  },
  'help.commands': { ru: 'Команды:', en: 'Commands:' },
  'help.sec.session': { ru: 'Сессия', en: 'Session' },
  'help.sec.workspace': { ru: 'Рабочая директория', en: 'Workspace' },
  'help.sec.git': { ru: 'Git', en: 'Git' },
  'help.sec.agent': { ru: 'Агент', en: 'Agent' },
  'help.sec.context': { ru: 'Контекст и настройки', en: 'Context & settings' },
  'help.sec.files': { ru: 'Файлы и прочее', en: 'Files & misc' },
  'help.cmd.new': {
    ru: '/new, /clear             новый чат (сброс контекста)',
    en: '/new, /clear             new chat (reset context)',
  },
  'help.cmd.sessions': {
    ru: '/sessions [фильтр]        список сохранённых сессий (можно фильтровать)',
    en: '/sessions [filter]        list saved sessions (optionally filtered)',
  },
  'help.cmd.resume_id': {
    ru: '/resume-id <id>          восстановить сессию по полному id',
    en: '/resume-id <id>          resume a session by full id',
  },
  'help.cmd.chats': {
    ru: '/chats [фильтр]          список последних чатов DeepSeek',
    en: '/chats [filter]          recent DeepSeek chats',
  },
  'help.cmd.resume': {
    ru: '/resume <n>              открыть чат №n из /chats',
    en: '/resume <n>              open chat #n from /chats',
  },
  'help.cmd.last': {
    ru: '/last                    открыть последний чат этого каталога',
    en: '/last                    open the last chat of this directory',
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
  'help.cmd.rewind': {
    ru: '/rewind [n]              откатить рабочее дерево к чекпойнту',
    en: '/rewind [n]              roll the working tree back to a checkpoint',
  },
  'help.cmd.rewind_list': {
    ru: '/rewind-list             список чекпойнтов',
    en: '/rewind-list             list checkpoints',
  },
  'help.cmd.transcript': {
    ru: '/transcript              путь к файлу транскрипта',
    en: '/transcript              transcript file path',
  },
  'help.cmd.diff': {
    ru: '/diff [--staged] показать git diff',
    en: '/diff [--staged] show working tree git diff',
  },
  'help.cmd.diffstat': {
    ru: '/diffstat сводка изменений (git diff --stat)',
    en: '/diffstat change summary (git diff --stat)',
  },
  'help.cmd.retry': {
    ru: '/retry повторить последнюю задачу в этом чате',
    en: '/retry resend the last task into this chat',
  },
  'help.cmd.rename': {
    ru: '/rename <title> задать имя текущей сессии',
    en: '/rename <title> set the current session title',
  },
  'help.cmd.context': {
    ru: '/context что загружено в промпт (AGENTS/MEMORY/skills/commands)',
    en: '/context what is loaded into the prompt (AGENTS/MEMORY/skills/commands)',
  },
  'help.cmd.copy': {
    ru: '/copy скопировать последний ответ в буфер обмена',
    en: '/copy copy the last answer to the clipboard',
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
  'help.cmd.add_dir': {
    ru: '/add-dir <path> проверить директорию',
    en: '/add-dir <path> validate a directory',
  },
  'help.cmd.review': {
    ru: '/review [focus] ревью незакоммиченных изменений',
    en: '/review [focus] review uncommitted changes',
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
    ru: '/backlog <текст> записать идею в BACKLOG.md',
    en: '/backlog <text> record an idea in BACKLOG.md',
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
  'help.cmd.plan': {
    ru: '/plan [on|off] режим плана: только чтение, без правок и команд',
    en: '/plan [on|off] plan mode: read-only, no edits or commands',
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
    ru: 'формат вывода: text|json|jsonl (для скриптов)',
    en: 'output format: text|json|jsonl (for scripts)',
  },
  'help.opt.plan': {
    ru: 'стартовать в режиме плана (только чтение)',
    en: 'start in plan mode (read-only)',
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
    ru: 'Директория существует: {v}. Только проверка — песочница фиксируется при запуске, доступ не расширяется (перезапустите с --dir, чтобы работать там).',
    en: 'Directory exists: {v}. Check only — the sandbox is fixed at startup, access is NOT granted (relaunch with --dir to work there).',
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
  'help.cmd.remember': {
    ru: '/remember <текст>        дописать заметку в MEMORY.md',
    en: '/remember <text>         append a note to MEMORY.md',
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
}
