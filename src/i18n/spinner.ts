// Spinner / editor status strings.
export const spinnerMessages: Record<string, { ru: string; en: string }> = {
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
  'state.settled': { ru: '✓ готово', en: '✓ done' },
  'editor.more': { ru: '…ещё {n}', en: '…{n} more' },
  'editor.page_hint': {
    ru: '(Ctrl+N/Ctrl+P — листать, Tab — вставить)',
    en: '(Ctrl+N/Ctrl+P to page, Tab to insert)',
  },
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
}
