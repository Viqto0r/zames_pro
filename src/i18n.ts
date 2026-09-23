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
  'help.opt.dir': { ru: 'рабочая директория агента', en: 'agent working directory' },
  'help.opt.task': { ru: 'задача одной строкой', en: 'single-line task' },
  'help.opt.chat': { ru: 'продолжить существующий чат по id', en: 'resume an existing chat by id' },
  'help.opt.resume_last': { ru: 'вернуться в последний сохранённый чат', en: 'resume the last saved chat' },
  'help.opt.new_chat': { ru: 'начать новый чат (по умолчанию)', en: 'start a new chat (default)' },
  'help.opt.resend_prompt': { ru: 'дослать system-prompt в существующий чат', en: 'resend system-prompt into an existing chat' },
  'help.opt.max_iter': { ru: 'лимит итераций (по умолчанию {n})', en: 'iteration limit (default {n})' },
  'help.opt.headless': { ru: 'браузер без UI', en: 'headless browser' },
  'help.opt.debug': { ru: 'подробный лог', en: 'verbose log' },
  'help.opt.calibrate': { ru: 'режим калибровки селекторов', en: 'selector calibration mode' },
  'help.opt.dev': { ru: 'режим разработки: авто-перечитывание модулей', en: 'dev mode: auto-reload modules' },
  'help.opt.version': { ru: 'показать версию', en: 'show version' },
  'help.opt.help': { ru: 'эта справка', en: 'this help' },
  'help.while_working': { ru: 'Пока агент работает:', en: 'While the agent is working:' },
  'help.key.queue': { ru: 'печать + Enter           поставить сообщение в очередь (уйдёт после текущей задачи)', en: 'type + Enter              queue a message (sent after the current task)' },
  'help.key.history': { ru: '↑ / ↓                    история введённых сообщений', en: '↑ / ↓                     input history' },
  'help.key.words': { ru: 'Ctrl+← / Ctrl+→          перемещение по словам', en: 'Ctrl+← / Ctrl+→           move by words' },
  'help.key.slash': { ru: '/ + Tab                  подсказка и автодополнение slash-команд', en: '/ + Tab                   slash-command hints and completion' },
  'help.key.newline': { ru: 'Ctrl+J / Ctrl+Enter      новая строка (Shift+Enter в терминалах с поддержкой)', en: 'Ctrl+J / Ctrl+Enter       new line (Shift+Enter in capable terminals)' },
  'help.key.backslash': { ru: '\\ + Enter                тоже новая строка', en: '\\ + Enter                also a new line' },
  'help.key.attach': {
    ru: 'Ctrl+Shift+V картинки      вставить изображение/файл (сохранится в tmp)',
    en: 'Ctrl+Shift+V image         paste an image/file (saved to tmp)',
  },
  'help.key.esc': { ru: 'Esc, Ctrl+C              прервать текущую генерацию', en: 'Esc, Ctrl+C               abort current generation' },
  'help.commands': { ru: 'Обычные команды:', en: 'Commands:' },
  'help.cmd.new': { ru: '/new, /clear             новый чат (сброс контекста)', en: '/new, /clear             new chat (reset context)' },
  'help.cmd.sessions': { ru: '/sessions                список сохранённых сессий', en: '/sessions                list saved sessions' },
  'help.cmd.resume_id': { ru: '/resume-id <id>          восстановить сессию по полному id', en: '/resume-id <id>          resume a session by full id' },
  'help.cmd.chats': { ru: '/chats                   список последних чатов DeepSeek', en: '/chats                   recent DeepSeek chats' },
  'help.cmd.resume': { ru: '/resume <n>              открыть чат №n из /chats', en: '/resume <n>              open chat #n from /chats' },
  'help.cmd.chat': { ru: '/chat                    показать текущий chat id', en: '/chat                    show current chat id' },
  'help.cmd.cd': { ru: '/cd <path>               сменить рабочую директорию', en: '/cd <path>               change working directory' },
  'help.cmd.pwd': { ru: '/pwd                     текущая директория', en: '/pwd                     current directory' },
  'help.cmd.status': { ru: '/status                  состояние сессии', en: '/status                  session state' },
  'help.cmd.reload': { ru: '/reload                  перечитать модули логики без перезапуска', en: '/reload                  hot-reload logic modules' },
  'help.cmd.undo': { ru: '/undo                    откатить последнюю запись/правку', en: '/undo                    revert the last write/edit' },
  'help.cmd.undo_list': { ru: '/undo-list               список того, что можно откатить', en: '/undo-list               list revertable changes' },
  'help.cmd.transcript': { ru: '/transcript              путь к файлу транскрипта', en: '/transcript              transcript file path' },
  'help.cmd.config': { ru: '/config                  настройки: показать и изменить', en: '/config                  settings: view and edit' },
  'help.cmd.lang': { ru: '/config lang <ru|en>     сменить язык интерфейса и агента', en: '/config lang <ru|en>     switch UI and agent language' },
  'help.cmd.debug_dom': { ru: '/debug-dom               сохранить HTML страницы (для отладки)', en: '/debug-dom               dump page HTML (debug)' },
  'help.cmd.help': { ru: '/help, help              справка', en: '/help, help              this help' },
  'help.cmd.exit': { ru: '/exit, /quit, exit       выход', en: '/exit, /quit, exit       exit' },
  'help.self_review': { ru: 'Самообзор (отладка агента):', en: 'Self-review (agent debugging):' },
  'help.self.review': { ru: '/self-review [фокус]     снять снапшот src/ и запустить ревью', en: '/self-review [focus]     snapshot src/ and run review' },
  'help.self.fix': { ru: '/self-fix <name> [фокус] вернуться в существующий снапшот и продолжить', en: '/self-fix <name> [focus] enter an existing snapshot and continue' },
  'help.self.done': { ru: '/self-done               выйти из режима ревью (вернуться в свою папку)', en: '/self-done               leave review mode (back to your dir)' },
  'help.self.list': { ru: '/self-list               список снапшотов', en: '/self-list               list snapshots' },
  'help.self.diff': { ru: '/self-diff <name>        различия между текущим src/ и снапшотом', en: '/self-diff <name>        diff between current src/ and snapshot' },
  'help.self.apply': { ru: '/self-apply <name>       применить снапшот к src/ (с бэкапом)', en: '/self-apply <name>       apply snapshot to src/ (with backup)' },
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
    ru: 'Замешиваю кал…|Взбиваю кал до однородной массы…|Мешаю кал с логикой…|Взбалтываю кал в коктейль…|Кручу венчиком по калу…|Смешиваю кал с кофеином…|Замешиваю тесто из кала…|Взбиваю пену из кала…|Перемешиваю кал лопатой…|Замешиваю глину из кала…|Гомогенизирую кал до состояния бетона…|Взбалтываю кал до просветления…|Блендерю кал в смузи…|Замешиваю цемент из кала…|Взбиваю кашу из кала…|Мешаю кал с надеждой…|Взбалтываю осадок из кала…|Кручу блендером по калу…|Смешиваю кал до неразличимости…|Замешиваю раствор из кала…|Взбиваю коктейль «кал»…|Перемешиваю кал лопатой дедлайна…|Взбиваю пенку из кала…|Гомогенизирую кал до однородности…|Взбалтываю кал в бетономешалке…|Сбиваю кал в однородную массу…|Размешиваю кал до просветления…|Замешиваю кал из всего подряд…',
    en: 'Mixing the slurry…|Whipping it to a smooth paste…|Stirring logic into it…|Shaking it into a cocktail…|Whisking it around…|Blending it with caffeine…|Kneading dough out of it…|Whipping it into foam…|Tossing it with a spatula…|Kneading clay out of it…|Homogenizing it into concrete…|Shaking it until clear…|Blending it into a smoothie…|Mixing cement out of it…|Whipping porridge out of it…|Stirring it with hope…|Swirling the sediment…|Running the blender over it…|Mixing it beyond recognition…|Mixing mortar out of it…|Whipping a cocktail of it…|Stirring it with the deadline spatula…|Whipping foam out of it…|Homogenizing it evenly…|Tumbling it in a cement mixer…|Beating it into a uniform mass…|Stirring it until clear…|Mixing it from whatever is around…',
  },
  'spinner.hint': { ru: 'Esc — стоп', en: 'Esc — stop' },

  // ---------- status ----------
  'status.workdir': { ru: 'Рабочая директория: {v}', en: 'Working directory: {v}' },
  'status.review_mode': { ru: 'Режим ревью: {v}', en: 'Review mode: {v}' },
  'status.review_none': { ru: 'нет', en: 'no' },
  'status.orig_dir': { ru: 'Исходная директория: {v}', en: 'Original directory: {v}' },
  'status.chat': { ru: 'Текущий чат: {v}', en: 'Current chat: {v}' },
  'status.fresh_next': { ru: 'Fresh chat на след. задаче: {v}', en: 'Fresh chat next task: {v}' },
  'status.prompt_next': { ru: 'System prompt на след. задаче: {v}', en: 'System prompt next task: {v}' },
  'status.resend': { ru: 'Resend prompt (--resend-prompt): {v}', en: 'Resend prompt (--resend-prompt): {v}' },
  'status.last_chat': { ru: 'Last chat: {v}', en: 'Last chat: {v}' },
  'status.sessions': { ru: 'Сессии: {v}', en: 'Sessions: {v}' },
  'status.dev': { ru: 'Dev mode (auto-reload): {v}', en: 'Dev mode (auto-reload): {v}' },
  'status.max_iter': { ru: 'Лимит итераций: {v}', en: 'Iteration limit: {v}' },
  'status.headless': { ru: 'Headless: {v}', en: 'Headless: {v}' },
  'status.debug': { ru: 'Debug: {v}', en: 'Debug: {v}' },
  'status.undo': { ru: 'Undo: {v}', en: 'Undo: {v}' },
  'status.transcript': { ru: 'Транскрипт: {v}', en: 'Transcript: {v}' },
  'status.locale': { ru: 'Язык: {v}', en: 'Language: {v}' },

  // ---------- messages ----------
  'msg.working_dir': { ru: 'Рабочая директория: {v}', en: 'Working directory: {v}' },
  'msg.transcript': { ru: 'Транскрипт: {v}', en: 'Transcript: {v}' },
  'msg.new_chat': { ru: 'Создаю новый чат...', en: 'Creating a new chat...' },
  'msg.new_chat_ok': { ru: 'Новый чат.', en: 'New chat.' },
  'msg.resuming': { ru: 'Восстанавливаю сессию {id}...', en: 'Restoring session {id}...' },
  'msg.input_locked': { ru: 'Идёт операция, ввод временно заблокирован…', en: 'Operation in progress, input is temporarily locked…' },
  'msg.opening_chat': { ru: 'Открываю чат {id}...', en: 'Opening chat {id}...' },
  'msg.chat_opened': { ru: 'Чат открыт.', en: 'Chat opened.' },
  'msg.interactive': { ru: 'Интерактивный режим. Введите задачу. Команды — /help. Выход — /exit.', en: 'Interactive mode. Enter a task. Commands — /help. Exit — /exit.' },
  'msg.queue_hint': { ru: 'Пока агент работает, можно печатать следующее сообщение — оно уйдёт в очередь (Enter — отправить, Esc — прервать).', en: 'While the agent works you can type the next message — it goes to the queue (Enter — send, Esc — abort).' },
  'msg.unknown_cmd': { ru: 'Неизвестная команда: {v}. Набери /help.', en: 'Unknown command: {v}. Type /help.' },
  'msg.bye': { ru: 'Выход.', en: 'Bye.' },
  'msg.abort_gen': { ru: '⏹ Esc — прерываю генерацию...', en: '⏹ Esc — aborting generation...' },
  'msg.abort_ctrlc': { ru: '⏹ Ctrl+C — прерываю генерацию...', en: '⏹ Ctrl+C — aborting generation...' },
  'msg.queued': { ru: '📨 В очередь ({n}): ', en: '📨 Queued ({n}): ' },
  'msg.attached_image': {
    ru: '🖼 Вложено изображение {marker} ({size}) — сохранено в tmp',
    en: '🖼 Attached image {marker} ({size}) — saved to tmp',
  },
  'msg.attached_file': {
    ru: '📎 Вложен файл {marker} {name} ({size}) — сохранён в tmp',
    en: '📎 Attached file {marker} {name} ({size}) — saved to tmp',
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
  'msg.from_queue': { ru: '▶ Из очереди: ', en: '▶ From queue: ' },
  'msg.agent_error': { ru: '✖ Ошибка агента:', en: '✖ Agent error:' },
  'msg.suspicious_stop': {
    ru: 'агент, похоже, остановился, не распознав вызов инструмента. Ответ сохранён в транскрипте (событие suspicious_final). Можно попросить продолжить или переотправить задачу.',
    en: 'the agent seems to have stopped without recognizing a tool call. The response is saved in the transcript (suspicious_final event). You can ask it to continue or resend the task.',
  },
  'msg.critical': { ru: 'Критическая ошибка:', en: 'Critical error:' },
  'msg.not_dir': { ru: 'Не директория: {v}', en: 'Not a directory: {v}' },
  'prompt.review': { ru: 'REVIEW', en: 'REVIEW' },
  'msg.workdir_error': { ru: 'Не удалось определить рабочую директорию:', en: 'Failed to determine the working directory:' },
  'msg.browser_error': { ru: 'Не удалось запустить браузер:', en: 'Failed to launch the browser:' },
  'msg.open_chat_error': { ru: 'Не удалось открыть чат: {v}', en: 'Failed to open chat: {v}' },
  'msg.new_chat_error': { ru: 'Не удалось создать новый чат: {v}', en: 'Failed to create a new chat: {v}' },
  'msg.reload_start': { ru: 'Перечитываю модули логики...', en: 'Reloading logic modules...' },
  'msg.reload_partial': { ru: 'Часть модулей не перезагрузилась:', en: 'Some modules failed to reload:' },
  'msg.reload_done': { ru: 'Перезагружено модулей: {n}. Браузер и чат не тронуты.', en: 'Reloaded modules: {n}. Browser and chat untouched.' },
  'msg.reload_error': { ru: 'Ошибка reload:', en: 'Reload error:' },
  'msg.abort_gen_short': { ru: '⏹ Esc — прерываю генерацию...', en: '⏹ Esc — aborting generation...' },
  'msg.abort_ctrlc_short': { ru: '⏹ Ctrl+C — прерываю генерацию...', en: '⏹ Ctrl+C — aborting generation...' },

  // ---------- self-review ----------
  'self.review_failed': { ru: 'Самообзор провалился:', en: 'Self-review failed:' },
  'self.fix_usage': { ru: 'Использование: /self-fix <name> [фокус]', en: 'Usage: /self-fix <name> [focus]' },
  'self.snapshot_not_found': { ru: 'Снапшот не найден: {v}', en: 'Snapshot not found: {v}' },
  'self.init_review_chat': { ru: 'Инициализирую review-чат для снапшота...', en: 'Initializing review chat for the snapshot...' },
  'self.enter_failed': { ru: 'Не удалось войти в снапшот:', en: 'Failed to enter the snapshot:' },
  'self.not_in_review': { ru: 'Ты и так не в режиме ревью.', en: 'You are not in review mode.' },
  'self.diff_usage': { ru: 'Использование: /self-diff <name>', en: 'Usage: /self-diff <name>' },
  'self.apply_usage': { ru: 'Использование: /self-apply <name>', en: 'Usage: /self-apply <name>' },
  'self.fix_hint': { ru: '\n💡 Режим ревью по снапшоту {name}. Пиши агенту задачу или /self-done.\n', en: '\n💡 Review mode on snapshot {name}. Send the agent a task or /self-done.\n' },
  'self.done_hint': { ru: 'Вернулся в {v}. Следующая задача начнёт новый чат.\n', en: 'Back to {v}. The next task will start a new chat.\n' },
  'self.review_hint': {
    ru: '\n💡 Теперь ты в режиме ревью. Просто пиши агенту, например:\n   «исправь ошибки»\n   «доработай обработку ошибок в ask()»\n   «покажи, что не так с undo»\nВыйти: /self-done.  Применить: /self-apply {name}\n',
    en: '\n💡 You are now in review mode. Just ask the agent, e.g.:\n   "fix the errors"\n   "improve error handling in ask()"\n   "show what is wrong with undo"\nExit: /self-done.  Apply: /self-apply {name}\n',
  },

  // ---------- chats / sessions ----------
  'chats.recent': { ru: 'Последние чаты DeepSeek:', en: 'Recent DeepSeek chats:' },
  'chats.use_resume': { ru: '\nИспользуй /resume <n> для продолжения.\n', en: '\nUse /resume <n> to continue.\n' },
  'chats.none': { ru: 'Чатов не найдено.', en: 'No chats found.' },
  'chats.fetch_error': { ru: 'Не удалось получить список:', en: 'Failed to fetch the list:' },
  'chats.resume_usage': { ru: 'Использование: /resume <n>  (или /chats для списка)', en: 'Usage: /resume <n>  (or /chats for the list)' },
  'chats.need_number': { ru: 'Нужен номер из /chats.', en: 'A number from /chats is required.' },
  'chats.run_chats_first': { ru: 'Сначала выполни /chats.', en: 'Run /chats first.' },
  'chats.no_n': { ru: 'Нет чата №{n}. Всего: {total}.', en: 'No chat #{n}. Total: {total}.' },
  'chats.opening': { ru: 'Открываю: {v}', en: 'Opening: {v}' },
  'chats.context_kept': { ru: ' Контекст чата сохранён. Системный промпт не пересылается (--resend-prompt чтобы дослать).\n', en: ' Chat context kept. System prompt is not resent (--resend-prompt to force).\n' },
  'chats.prompt_will_resend': { ru: ' Системный промпт будет переслан на следующей задаче.\n', en: ' System prompt will be resent on the next task.\n' },
  'chats.current_id': { ru: 'Текущий chat id: {v}', en: 'Current chat id: {v}' },
  'chats.not_created': { ru: 'Чат ещё не создан.', en: 'No chat created yet.' },
  'sessions.dir': { ru: 'Папка сессий: {v}', en: 'Sessions dir: {v}' },
  'sessions.none': { ru: 'Сохранённых сессий нет. Они появятся после первой задачи/чата.', en: 'No saved sessions. They appear after the first task/chat.' },
  'sessions.restore_hint': { ru: 'Восстановить: /resume-id <id>  (полный id) или /resume <n> после /chats.', en: 'Restore: /resume-id <id> (full id) or /resume <n> after /chats.' },
  'sessions.resume_id_usage': { ru: 'Использование: /resume-id <chat id>', en: 'Usage: /resume-id <chat id>' },

  // ---------- undo / dom ----------
  'undo.empty': { ru: 'История пуста.', en: 'History is empty.' },
  'undo.reverted': { ru: '↶ Откатили: {v}', en: '↶ Reverted: {v}' },
  'undo.restored': { ru: ' (восстановлено)', en: ' (restored)' },
  'undo.deleted': { ru: ' (удалено)', en: ' (deleted)' },
  'undo.failed': { ru: 'Не удалось откатить: {v}', en: 'Failed to revert: {v}' },
  'undo.changed': { ru: 'изменён', en: 'changed' },
  'undo.created': { ru: 'создан', en: 'created' },
  'dom.saved': { ru: 'HTML сохранён: {v}', en: 'HTML saved: {v}' },
  'dom.selectors': { ru: 'Селекторы:', en: 'Selectors:' },
  'dom.save_error': { ru: 'Не удалось сохранить DOM:', en: 'Failed to save DOM:' },

  // ---------- cd ----------
  'cd.outside': { ru: 'Нельзя выйти за пределы: {v}', en: 'Cannot leave the sandbox: {v}' },
  'cd.not_dir': { ru: 'Не директория: {v}', en: 'Not a directory: {v}' },
  'cd.already': { ru: 'Уже здесь.', en: 'Already here.' },
  'cd.left_review': { ru: 'Вышел из режима ревью (/cd).', en: 'Left review mode (/cd).' },
  'cd.changed': { ru: 'Рабочая директория: {v}', en: 'Working directory: {v}' },
  'cd.failed': { ru: 'Не удалось перейти: {v}', en: 'Failed to change directory: {v}' },

  'calibrate': { ru: '\n🔧 Режим калибровки селекторов\n', en: '\n🔧 Selector calibration mode\n' },
  'reload.auto_partial': { ru: '⚠ авто-reload: часть модулей не загрузилась, работаю на прежней версии:', en: '⚠ auto-reload: some modules failed, using previous version:' },


  // ---------- config menu ----------
  'cfg.group.ui': { ru: 'Интерфейс', en: 'Interface' },
  'cfg.group.agent': { ru: 'Агент', en: 'Agent' },
  'cfg.group.confirmation': { ru: 'Подтверждения', en: 'Confirmations' },
  'cfg.group.undo': { ru: 'Откат (undo)', en: 'Undo' },
  'cfg.group.transcript': { ru: 'Транскрипт', en: 'Transcript' },
  'cfg.group.browser': { ru: 'Браузер / DeepSeek', en: 'Browser / DeepSeek' },

  'cfg.f.ui_locale': { ru: 'Язык интерфейса и ответов агента', en: 'Interface and agent reply language' },
  'cfg.f.maxIterations': { ru: 'Лимит итераций на задачу', en: 'Max agent loop iterations per task' },
  'cfg.f.headless': { ru: 'Браузер без UI (нужен перезапуск)', en: 'Headless browser (needs restart)' },
  'cfg.f.debug': { ru: 'Подробный лог', en: 'Verbose debug logging' },
  'cfg.f.hotReload': { ru: 'Авто-перечитывание модулей перед задачей', en: 'Auto-reload logic modules before each task' },
  'cfg.f.confirmation_write': { ru: 'Спрашивать перед Write', en: 'Ask before Write' },
  'cfg.f.confirmation_edit': { ru: 'Спрашивать перед Edit', en: 'Ask before Edit' },
  'cfg.f.confirmation_bash': { ru: 'Спрашивать перед Bash', en: 'Ask before Bash' },
  'cfg.f.undo_enabled': { ru: 'Включить бэкапы для отката', en: 'Enable undo backups' },
  'cfg.f.undo_maxBackups': { ru: 'Сколько бэкапов хранить', en: 'Max undo backups kept' },
  'cfg.f.transcript_enabled': { ru: 'Вести транскрипт', en: 'Write transcript log' },
  'cfg.f.browser_answerTimeoutMs': { ru: 'Ждать ответ, мс', en: 'Wait for an answer, ms' },
  'cfg.f.browser_askRetries': { ru: 'Число повторов ask()', en: 'ask() retry count' },
  'cfg.f.browser_stabilityChecks': { ru: 'Проверки стабильности ответа', en: 'Answer stability checks' },
  'cfg.f.browser_stabilityDelayMs': { ru: 'Пауза между проверками, мс', en: 'Delay between stability checks, ms' },
  'cfg.f.browser_minSendIntervalMs': { ru: 'Мин. пауза между отправками, мс', en: 'Min pause between sends, ms' },
  'cfg.f.browser_rateLimitWaitMs': { ru: 'Пауза при лимите частоты, мс', en: 'Wait on rate limit, ms' },
  'cfg.f.browser_maxRateLimitRetries': { ru: 'Число повторов при лимите', en: 'Rate-limit retry count' },

  'cfg.menu.title': { ru: '⚙ Настройки — выбери параметр', en: '⚙ Settings — choose a parameter' },
  'cfg.menu.hint': { ru: '↑/↓ — выбор, Enter — изменить, q/Esc — выйти', en: '↑/↓ select, Enter edit, q/Esc quit' },
  'cfg.menu.edit_hint': { ru: 'Введи значение и Enter (пусто — отмена)', en: 'Enter a value and press Enter (empty — cancel)' },
  'cfg.menu.saved': { ru: '✔ Сохранено: {v} = {value}', en: '✔ Saved: {v} = {value}' },
  'cfg.menu.default': { ru: 'по умолчанию', en: 'default' },
  'cfg.menu.notty': { ru: 'Меню доступно только в интерактивном терминале. Используй /config list|get|set.', en: 'The menu needs an interactive terminal. Use /config list|get|set.' },
  // ---------- config ----------
  'cfg.title': { ru: 'Настройки zames', en: 'zames settings' },
  'cfg.current': { ru: 'Текущий конфиг:', en: 'Current config:' },
  'cfg.usage': {
    ru: 'Использование: /config [menu | list | get <путь> | set <путь> <значение> | reset <путь> | path | lang <ru|en>]',
    en: 'Usage: /config [menu | list | get <path> | set <path> <value> | reset <path> | path | lang <ru|en>]',
  },
  'cfg.saved': { ru: 'Сохранено: {v} = {value}', en: 'Saved: {v} = {value}' },
  'cfg.reset': { ru: 'Сброшено к дефолту: {v}', en: 'Reset to default: {v}' },
  'cfg.value': { ru: '{v} = {value}', en: '{v} = {value}' },
  'cfg.unknown_key': { ru: 'Неизвестный параметр: {v}', en: 'Unknown setting: {v}' },
  'cfg.bad_value': { ru: 'Неверное значение для {v}: ожидалось {type}', en: 'Invalid value for {v}: expected {type}' },
  'cfg.write_error': { ru: 'Не удалось записать конфиг: {v}', en: 'Failed to write config: {v}' },
  'cfg.paths': { ru: 'Конфиг (глобальный): {global}\nКонфиг (проект): {project}', en: 'Config (global): {global}\nConfig (project): {project}' },
  'cfg.keys': { ru: 'Доступные параметры:', en: 'Available settings:' },
  'cfg.lang_set': { ru: 'Язык переключён на {v}.', en: 'Language switched to {v}.' },
  'cfg.lang_usage': { ru: 'Использование: /config lang <ru|en>', en: 'Usage: /config lang <ru|en>' },

  // ---------- system prompt ----------
  'prompt.answer_language': {
    ru: 'ВАЖНО: отвечай оператору на русском языке. Весь текст в поле message инструмента respond, а также любые пояснения — на русском.',
    en: 'IMPORTANT: reply to the operator in English. All text in the respond tool message field, and any explanations, must be in English.',
  },
  'prompt.tools_header': { ru: 'You have access to the following tools:', en: 'You have access to the following tools:' },
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

export type TranslateFn = (
  key: string,
  params?: TranslateParams,
) => string

export function translate(locale: Locale): TranslateFn {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE
  return (key: string, params?: TranslateParams): string => {
    const entry = CATALOG[key]
    let template = entry ? entry[loc] || entry[DEFAULT_LOCALE] : key
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
