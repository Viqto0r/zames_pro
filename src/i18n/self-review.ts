// Self-review and chats/sessions messages.
export const selfReviewMessages: Record<string, { ru: string; en: string }> = {
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
  'time.now': { ru: 'только что', en: 'just now' },
  'time.min_ago': { ru: '{n} мин назад', en: '{n}m ago' },
  'time.hour_ago': { ru: '{n} ч назад', en: '{n}h ago' },
  'time.day_ago': { ru: '{n} дн назад', en: '{n}d ago' },
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
}
