// GLM (chat.z.ai) provider messages — everything the operator sees while the
// active backend is GLM. Kept in its own section file (like qwen.ts /
// deepseek.ts) so provider-specific wording has one home. The generic
// `model.*` / `provider.*` keys live in i18n/help.ts and i18n/qwen.ts.

export const glmMessages: Record<string, { ru: string; en: string }> = {
  'glm.guest_mode': {
    ru: 'GLM: вход не выполнен, работаю гостем (сообщения может блокировать капча). Войдите через /provider login или запустите с --headed.',
    en: 'GLM: not signed in, running as a guest (a captcha may block messages). Log in via /provider login or launch with --headed.',
  },
  'glm.login_ok': {
    ru: 'GLM: вход выполнен.',
    en: 'GLM: signed in.',
  },
  'glm.captcha': {
    ru: '✖ GLM показывает проверку «security verification» (капча-слайдер) и не отправляет сообщение. Войдите в аккаунт: /provider login (в видимом окне капчу решает человек).',
    en: '✖ GLM shows a "security verification" slider captcha and blocks the send. Sign in with /provider login (a human solves the captcha in the visible window).',
  },
  'glm.restart_browser': {
    ru: '⚠ GLM: страница браузера потеряна — перезапускаю и вхожу заново...',
    en: '⚠ GLM: the browser lost the page — restarting and signing in again...',
  },
  'glm.restart_failed': {
    ru: '⚠ GLM: не удалось перезапустить браузер: {error}',
    en: '⚠ GLM: could not restart the browser: {error}',
  },
  'glm.model_error': {
    ru: 'Не удалось получить список моделей GLM: {v}',
    en: 'Failed to fetch the GLM model list: {v}',
  },
  'glm.rate_limit_wait': {
    ru: '⏳ {provider}: «слишком часто». Жду {min} мин ({attempt}/{max}) и повторю отправку...',
    en: '⏳ {provider}: "too frequent". Waiting {min} min ({attempt}/{max}), then resending...',
  },
  'glm.server_busy_wait': {
    ru: '⏳ {provider}: сервер занят. Жду {sec}с ({attempt}/{max}) и повторю...',
    en: '⏳ {provider}: server busy. Waiting {sec}s ({attempt}/{max}), then retrying...',
  },
  'glm.incomplete_retry': {
    ru: '⏳ {provider} оборвал ответ — переотправляю задачу ({attempt}/{max})...',
    en: '⏳ {provider} truncated the answer — resending the task ({attempt}/{max})...',
  },
  'glm.ask_retry': {
    ru: '⚠ Отправка не удалась (попытка {attempt}/{max} на этот запрос): {error} — повторяю...',
    en: '⚠ Send failed (attempt {attempt}/{max} for this request): {error} — retrying...',
  },
  'glm.ask_failed': {
    ru: '✖ Не удалось получить ответ от {provider} после {max} попыток: {error}',
    en: '✖ Could not get an answer from {provider} after {max} attempts: {error}',
  },
  'glm.attach_read_failed': {
    ru: '⚠ не удалось прочитать вложение {name}: {error}',
    en: '⚠ could not read the attachment {name}: {error}',
  },
  'glm.attach_no_input': {
    ru: '⚠ не найдено поле загрузки файлов — вложения не прикреплены',
    en: '⚠ file upload field not found — the attachments were not attached',
  },
  'glm.input_missing': {
    ru: '✖ Не найдено поле ввода на странице {provider}. Запусти /debug-dom и поправь INPUT_SELECTORS.',
    en: '✖ The {provider} input field was not found. Run /debug-dom and fix INPUT_SELECTORS.',
  },
  'glm.send_no_new_answer': {
    ru: '✖ Новый ответ не получен — на странице остался прежний текст. Проверь чат {provider} вручную.',
    en: '✖ No new answer received — the page still shows the previous text. Check the {provider} chat manually.',
  },
  'glm.send_button_missing': {
    ru: '✖ Кнопка отправки GLM не найдена или недоступна — сообщение не отправлено. Проверь чат вручную.',
    en: '✖ The GLM send button was not found or is disabled — the message was not sent. Check the chat manually.',
  },
  'glm.quota_exhausted': {
    ru: '✖ У аккаунта z.ai исчерпана квота (insufficient_quota). Это лимит аккаунта, а не пауза: пополните квоту или дождитесь сброса, повторы не помогут.',
    en: '✖ The z.ai account quota is exhausted (insufficient_quota). This is an account limit, not a pause: top up or wait for the reset; retrying will not help.',
  },
  'glm.mode_flags': {
    ru: '⚠ GLM: в теле запроса включён режим {v} — он меняет формат ответа и может сломать протокол tool-call.',
    en: '⚠ GLM: the request body has {v} enabled — it changes the answer format and may break the tool-call protocol.',
  },
  'glm.mode_mismatch': {
    ru: '⚠ GLM: сайт не применил ваши настройки режима ({v}) — ответ может прийти без размышлений/поиска.',
    en: '⚠ GLM: the site did not apply your mode setting ({v}) — the answer may come without thinking/search.',
  },
}
