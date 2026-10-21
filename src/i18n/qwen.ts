// Qwen (chat.qwen.ai) provider messages — everything the operator sees while
// the active backend is Qwen. Kept in its own section file (like deepseek.ts)
// so provider-specific wording has one home.

export const qwenMessages: Record<string, { ru: string; en: string }> = {
  'qwen.guest_mode': {
    ru: 'Qwen: вход не выполнен, работаю в гостевом режиме (≈10 сообщений в сутки, без вложений). Войдите через /provider login или запустите с --headed.',
    en: 'Qwen: not signed in, running in guest mode (~10 messages/day, no attachments). Log in via /provider login or launch with --headed.',
  },
  'qwen.login_email_prompt': {
    ru: 'Email для входа в Qwen{def}: ',
    en: 'Qwen login email{def}: ',
  },
  'qwen.login_code_prompt': {
    ru: 'Код из письма Qwen: ',
    en: 'Qwen email code: ',
  },
  'qwen.login_ok': {
    ru: 'Qwen: вход выполнен.',
    en: 'Qwen: signed in.',
  },
  'qwen.login_failed': {
    ru: 'Qwen: войти не удалось. Войдите вручную в окне браузера (запустите с --headed) и повторите.',
    en: 'Qwen: sign-in failed. Sign in manually in the browser window (launch with --headed) and retry.',
  },
  'qwen.guest_limit': {
    ru: 'Qwen: исчерпан суточный лимит гостя. Войдите в аккаунт (email / Google / GitHub) командой /provider login или запустите с --headed.',
    en: 'Qwen: the guest daily limit is exhausted. Sign in (email / Google / GitHub) with /provider login, or launch with --headed.',
  },
  'qwen.restart_browser': {
    ru: '⚠ Qwen: страница браузера потеряна — перезапускаю и вхожу заново...',
    en: '⚠ Qwen: the browser lost the page — restarting and signing in again...',
  },
  'qwen.restart_failed': {
    ru: '⚠ Qwen: не удалось перезапустить браузер: {error}',
    en: '⚠ Qwen: could not restart the browser: {error}',
  },
  // Generic model-picker wording shared by every provider that HAS a picker
  // (Qwen, GLM). The old `qwen.model_*` keys hardcoded "Qwen" and made the
  // command look Qwen-only.
  'model.set': {
    ru: 'Модель {provider}: {v}',
    en: '{provider} model: {v}',
  },
  'model.list': {
    ru: 'Доступные модели:\n{v}',
    en: 'Available models:\n{v}',
  },
  'model.pick_title': {
    ru: 'Выбор модели {provider}',
    en: 'Select a {provider} model',
  },
  'model.unsupported': {
    ru: '/model недоступен для {provider}: у этого провайдера нет выбора модели в zames (она задаётся в его веб-UI).',
    en: '/model is not available for {provider}: this provider has no model selection in zames (choose it in its web UI).',
  },
  'qwen.model_error': {
    ru: 'Не удалось получить список моделей Qwen: {v}',
    en: 'Failed to fetch the Qwen model list: {v}',
  },
  'qwen.age_gate_block': {
    ru: '✖ Qwen показывает окно "Confirm your age" (гостевой режим) и не даёт отправить сообщение. Войдите в аккаунт Qwen (команда /provider login) — в гостевом режиме первое сообщение блокируется.',
    en: '✖ Qwen shows the "Confirm your age" dialog (guest mode) and blocks the send. Sign in to Qwen (/provider login) — in guest mode the first message is blocked.',
  },
  'limits.title': {
    ru: 'Телеметрия отправок ({provider}):',
    en: 'Send telemetry ({provider}):',
  },
  'limits.window': {
    ru: '{label}: {n} отправок',
    en: '{label}: {n} sends',
  },
  'limits.rate': {
    ru: 'лимитов: {n}, средняя блокировка: {sec}с',
    en: 'rate limits: {n}, average block: {sec}s',
  },
  'limits.interval': {
    ru: 'текущая пауза: {sec}с{adaptive}',
    en: 'current pause: {sec}s{adaptive}',
  },
  'limits.adaptive_on': { ru: ' (адаптивная)', en: ' (adaptive)' },
  'limits.none': {
    ru: 'Файл телеметрии пока пуст ({path}).',
    en: 'The telemetry file is empty so far ({path}).',
  },
  'toggle.thinking_locked': {
    ru: 'GLM: размышления у этой модели всегда включены (сайт не даёт их выключить).',
    en: 'GLM: thinking is always on for this model (the site does not allow turning it off).',
  },
  'provider.switched': {
    ru: 'Провайдер чата: {v}.',
    en: 'Chat provider: {v}.',
  },
  'provider.switching': {
    ru: 'Переключаю провайдера на {v}: закрываю старый браузер и открываю {v}...',
    en: 'Switching provider to {v}: closing the old browser and opening {v}...',
  },
  'provider.switch_failed': {
    ru: '✖ Не удалось открыть браузер {v}: {error}. Остаюсь на прежнем провайдере; проверь вход и попробуй снова.',
    en: '✖ Could not open the {v} browser: {error}. Staying on the previous provider; check the login and retry.',
  },
  'provider.usage': {
    ru: 'Использование: /provider <{providers}> | /provider login | /provider status',
    en: 'Usage: /provider <{providers}> | /provider login | /provider status',
  },
  'provider.handoff_saved': {
    ru: 'Контекст текущего чата сжат и сохранён для {v}. Он подхватится в следующей задаче.',
    en: 'The current chat was summarized and saved for {v}. It will be carried over with the next task.',
  },
  'provider.handoff_used': {
    ru: '📎 Подхватил контекст предыдущего провайдера (carried-over summary).',
    en: '📎 Carried over the previous provider context (handoff summary).',
  },
  'provider.handoff_empty': {
    ru: 'Не удалось сжать историю — контекст НЕ перенесён. Текущий чат останется у старого провайдера.',
    en: 'Could not summarize the chat — context NOT carried over. The current chat stays with the old provider.',
  },
  'provider.login_done': {
    ru: 'Проверка входа завершена.',
    en: 'Login check complete.',
  },
  'provider.status': {
    ru: 'Провайдер: {v}, модель: {m}, вход: {auth}',
    en: 'Provider: {v}, model: {m}, login: {auth}',
  },

  // Qwen-specific statuses. The DeepSeek path had these under `ds.*`; using
  // the SAME keys from QwenBrowser broke provider encapsulation (a Qwen notice
  // was labelled with DeepSeek wording), so they live here instead.
  'qwen.rate_limit_wait': {
    ru: '⏳ {provider}: «слишком часто». Жду {min} мин ({attempt}/{max}) и повторю отправку...',
    en: '⏳ {provider}: "too frequent". Waiting {min} min ({attempt}/{max}), then resending...',
  },
  'qwen.server_busy_wait': {
    ru: '⏳ {provider}: сервер занят. Жду {sec}с ({attempt}/{max}) и повторю...',
    en: '⏳ {provider}: server busy. Waiting {sec}s ({attempt}/{max}), then retrying...',
  },
  'qwen.incomplete_retry': {
    ru: '⏳ {provider} оборвал ответ — переотправляю задачу ({attempt}/{max})...',
    en: '⏳ {provider} truncated the answer — resending the task ({attempt}/{max})...',
  },
  'qwen.ask_retry': {
    ru: '⚠ Отправка не удалась (попытка {attempt}/{max} на этот запрос): {error} — повторяю...',
    en: '⚠ Send failed (attempt {attempt}/{max} for this request): {error} — retrying...',
  },
  'qwen.ask_failed': {
    ru: '✖ Не удалось получить ответ от {provider} после {max} попыток: {error}',
    en: '✖ Could not get an answer from {provider} after {max} attempts: {error}',
  },
  'qwen.attach_read_failed': {
    ru: '⚠ не удалось прочитать вложение {name}: {error}',
    en: '⚠ could not read the attachment {name}: {error}',
  },
  'qwen.attach_no_input': {
    ru: '⚠ не найдено поле загрузки файлов — вложения не прикреплены',
    en: '⚠ file upload field not found — the attachments were not attached',
  },
  'qwen.input_missing': {
    ru: '✖ Не найдено поле ввода на странице {provider}. Запусти /debug-dom и поправь INPUT_SELECTORS.',
    en: '✖ The {provider} input field was not found. Run /debug-dom and fix INPUT_SELECTORS.',
  },
  'qwen.send_no_new_answer': {
    ru: '✖ Новый ответ не получен — на странице остался прежний текст. Возможно, сообщение не отправилось (кнопка отправки не нажалась). Проверь чат {provider} вручную.',
    en: '✖ No new answer received — the page still shows the previous text. The message may not have been sent (the send button was not pressed). Check the {provider} chat manually.',
  },
  'qwen.send_button_missing': {
    ru: '✖ Кнопка отправки Qwen не найдена или недоступна — сообщение не отправлено. Проверь чат вручную.',
    en: '✖ The Qwen send button was not found or is disabled — the message was not sent. Check the chat manually.',
  },
}
