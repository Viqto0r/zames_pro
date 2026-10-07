// Common UI strings: app/common, status, tasks, messages, diff, context, undo, cd.
export const commonMessages: Record<string, { ru: string; en: string }> = {
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
  'status.checkpoint': { ru: 'Чекпойнты: {v}', en: 'Checkpoints: {v}' },
  'status.transcript': { ru: 'Транскрипт: {v}', en: 'Transcript: {v}' },
  'status.locale': { ru: 'Язык: {v}', en: 'Language: {v}' },
  'status.goal': { ru: 'Цель сессии: {v}', en: 'Session goal: {v}' },
  'status.tasks_summary': {
    ru: 'задачи: {done}/{total}',
    en: 'tasks: {done}/{total}',
  },

  'tasks.title': { ru: 'Задачи агента:', en: 'Agent tasks:' },
  'tasks.empty': {
    ru: 'Список задач пуст (агент ещё не вызывал TodoWrite).',
    en: 'The task list is empty (the agent has not called TodoWrite yet).',
  },
  'tasks.restored': {
    ru: 'Восстановлен список задач: {done}/{total}',
    en: 'Task list restored: {done}/{total}',
  },

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
  'msg.first_login_hint': {
    ru: 'Сохранённой сессии DeepSeek нет — при первом запросе потребуется вход (логин/пароль спросят в терминале или открой --headed).',
    en: 'No saved DeepSeek session — the first task will need a sign-in (login/password are asked in the terminal, or use --headed).',
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
  'msg.missing_args': {
    ru: 'Не хватает обязательных аргументов: {v}.',
    en: 'Missing required arguments: {v}.',
  },
  'perm.ask': {
    ru: '⚠ Запрос подтверждения: {tool} ({reason})',
    en: '⚠ Approval required: {tool} ({reason})',
  },
  'perm.confirm': {
    ru: 'Разрешить выполнение?',
    en: 'Allow this call?',
  },
  'perm.allowed': {
    ru: '✔ Разрешено оператором.',
    en: '✔ Allowed by operator.',
  },
  'perm.denied': {
    ru: '✖ Отклонено оператором — вызов не выполнен.',
    en: '✖ Denied by operator — the call was not run.',
  },
  'msg.dev_only': {
    ru: 'Команда {v} доступна только в dev-режиме (--dev или hotReload).',
    en: 'The {v} command is only available in dev mode (--dev or hotReload).',
  },
  'msg.bye': { ru: 'Выход.', en: 'Bye.' },
  'shell.empty': {
    ru: 'После ! нужна команда, например !git status.',
    en: 'A command is required after !, e.g. !git status.',
  },
  'shell.running': {
    ru: 'выполняю shell-команду...',
    en: 'running shell command...',
  },
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
  // B5: shown when `@path` references in a task were inlined as file contents.
  'msg.at_refs': {
    ru: '📄 Встроено файлов по @-ссылкам: {n} —',
    en: '📄 Inlined @-referenced files: {n} —',
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

  'diff.no_changes': { ru: '(нет изменений)', en: '(no changes)' },
  'diff.more_lines': {
    ru: '... [{n} строк ещё, полный вывод — Bash git diff]',
    en: '... [{n} more lines, use Bash git diff for the full output]',
  },

  'context.title': {
    ru: 'Загружено в промпт:',
    en: 'Loaded into the prompt:',
  },
  'context.system_prompt': {
    ru: '  системный промпт: {n} символов',
    en: '  system prompt: {n} chars',
  },
  'context.agents': {
    ru: 'AGENTS.md / инструкции:',
    en: 'AGENTS.md / instructions:',
  },
  'context.memory': {
    ru: 'MEMORY.md:',
    en: 'MEMORY.md:',
  },
  'context.skills': {
    ru: 'Скиллы:',
    en: 'Skills:',
  },
  'context.commands': {
    ru: 'Кастомные команды:',
    en: 'Custom commands:',
  },
  'context.none': { ru: '(нет)', en: '(none)' },
  'context.near_full': {
    ru: '⚠ Контекст заполнен на {pct}% — подумайте о /compact, чтобы сжать историю.',
    en: '⚠ Context is {pct}% full — consider /compact to shrink the history.',
  },

  'retry.none': {
    ru: 'Нет последней задачи для повтора.',
    en: 'No last task to retry.',
  },
  'copy.none': {
    ru: 'Нет ответа для копирования.',
    en: 'No answer to copy.',
  },
  'copy.done': {
    ru: 'Скопировано в буфер обмена ({tool}).',
    en: 'Copied to clipboard ({tool}).',
  },
  'copy.failed': {
    ru: 'Не удалось скопировать (нет {tool} или он недоступен).',
    en: 'Could not copy ({tool} missing or unavailable).',
  },
  'retry.running': { ru: 'Повторяю задачу…', en: 'Retrying the task...' },
  'rename.usage': {
    ru: 'Использование: /rename <title>',
    en: 'Usage: /rename <title>',
  },
  'rename.done': {
    ru: 'Сессия переименована: {v}',
    en: 'Session renamed: {v}',
  },

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
  // T-D3: total time spent inside tools, then a top-N per-tool breakdown.
  'cost.by_time': {
    ru: ' время в инструментах: {dur}; топ по времени:',
    en: ' time in tools: {dur}; top by time:',
  },
  'cost.duration': { ru: ' длительность: {dur}', en: ' duration: {dur}' },
  'cost.started': { ru: ' начало: {v}', en: ' started: {v}' },
  'cost.transcript': { ru: ' транскрипт: {v}', en: ' transcript: {v}' },
  'cost.off': { ru: '(выкл)', en: '(off)' },

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
  'undo.reason_empty': { ru: 'история пуста', en: 'history is empty' },
  'undo.reason_disabled': {
    ru: 'undo отключён в конфиге',
    en: 'undo is disabled in the config',
  },
  'rewind.empty': { ru: 'Чекпойнтов нет.', en: 'No checkpoints.' },
  'rewind.created': {
    ru: '📸 Чекпойнт: {v}',
    en: '📸 Checkpoint: {v}',
  },
  'rewind.list_title': { ru: 'Чекпойнты:', en: 'Checkpoints:' },
  'rewind.reverted': {
    ru: '↶ Откатили рабочее дерево к чекпойнту {v}',
    en: '↶ Rolled the working tree back to checkpoint {v}',
  },
  'rewind.backup': {
    ru: 'Текущее состояние сохранено как чекпойнт {v}',
    en: 'Current state saved as checkpoint {v}',
  },
  'rewind.failed': {
    ru: 'Не удалось откатить: {v}',
    en: 'Failed to rewind: {v}',
  },
  'rewind.reason_not_found': {
    ru: 'чекпойнт не найден',
    en: 'checkpoint not found',
  },
  'rewind.reason_archive_missing': {
    ru: 'архив чекпойнта отсутствует',
    en: 'checkpoint archive is missing',
  },
  'rewind.reason_extract_failed': {
    ru: 'не удалось распаковать архив',
    en: 'failed to unpack the archive',
  },
  'rewind.reason_disabled': {
    ru: 'чекпойнты отключены в конфиге',
    en: 'checkpoints are disabled in the config',
  },
  'rewind.confirm': {
    ru: 'Откатить рабочее дерево к чекпойнту {v}? Текущее состояние будет сохранено как бэкап.',
    en: 'Roll the working tree back to checkpoint {v}? The current state will be saved as a backup.',
  },
  'rewind.cancelled': { ru: 'Отменено.', en: 'Cancelled.' },
  'rewind.label_backup': { ru: 'бэкап', en: 'backup' },
  'dom.saved': { ru: 'HTML сохранён: {v}', en: 'HTML saved: {v}' },
  'dom.selectors': { ru: 'Селекторы:', en: 'Selectors:' },
  'dom.save_error': {
    ru: 'Не удалось сохранить DOM:',
    en: 'Failed to save DOM:',
  },

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

  'reload.auto_partial': {
    ru: '⚠ авто-reload: часть модулей не загрузилась, работаю на прежней версии:',
    en: '⚠ auto-reload: some modules failed, using previous version:',
  },
  'reload.browser_restart': {
    ru: '⚠ browser.ts изменился, но он НЕ перезагружается на лету (в нём Playwright-контекст). Перезапусти zames, иначе изменения не применятся.',
    en: '⚠ browser.ts changed, but it is NOT hot-reloaded (it owns the Playwright context). Restart zames or the change will not apply.',
  },
}
