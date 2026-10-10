// DeepSeek-side problems and login/auth messages.
export const deepseekMessages: Record<string, { ru: string; en: string }> = {
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
  'ds.not_launched': {
    ru: '✖ Браузер не запущен.',
    en: '✖ The browser is not launched.',
  },
  'ds.open_chat_failed': {
    ru: '✖ Не удалось открыть чат {id}: {error}',
    en: '✖ Could not open chat {id}: {error}',
  },

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
  'auth.mfa_required': {
    ru: '🔐 DeepSeek требует код подтверждения на почту {v}.',
    en: '🔐 DeepSeek requires a verification code sent to {v}.',
  },
  'auth.mfa_code_sent': {
    ru: '🔐 DeepSeek требует код подтверждения. Запросил код на почту {v} — проверь почту.',
    en: '🔐 DeepSeek requires a verification code. Requested a code to {v} — check your inbox.',
  },
  'auth.mfa_prompt': {
    ru: 'Код из письма: ',
    en: 'Code from the email: ',
  },
  'auth.mfa_failed': {
    ru: 'Код подтверждения не принят: {v}',
    en: 'The verification code was not accepted: {v}',
  },

  'cfg.menu.title': {
    ru: '⚙ Настройки — выбери параметр',
    en: '⚙ Settings — choose a parameter',
  },
  'cfg.menu.hint': {
    ru: '↑/↓ — выбор, Enter — изменить, g — след. группа, / — поиск, q/Esc — выйти',
    en: '↑/↓ select, Enter edit, g next group, / search, q/Esc quit',
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
}
