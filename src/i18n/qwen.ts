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
  'qwen.login_pass_prompt': {
    ru: 'Пароль Qwen: ',
    en: 'Qwen password: ',
  },
  'qwen.login_ok': {
    ru: 'Qwen: вход выполнен.',
    en: 'Qwen: signed in.',
  },
  'qwen.login_failed': {
    ru: 'Qwen: войти не удалось. Войдите вручную в окне браузера (запустите с --headed) и повторите.',
    en: 'Qwen: sign-in failed. Sign in manually in the browser window (launch with --headed) and retry.',
  },
  'qwen.attach_unsupported': {
    ru: 'Qwen: вложения пока не поддерживаются — файлы не отправлены.',
    en: 'Qwen: attachments are not supported yet — files were not sent.',
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
  'qwen.model_set': {
    ru: 'Модель Qwen: {v}',
    en: 'Qwen model: {v}',
  },
  'qwen.model_list': {
    ru: 'Доступные модели Qwen:\n{v}',
    en: 'Available Qwen models:\n{v}',
  },
  'qwen.model_error': {
    ru: 'Не удалось получить список моделей Qwen: {v}',
    en: 'Failed to fetch the Qwen model list: {v}',
  },
  'provider.switched': {
    ru: 'Провайдер чата: {v}. Перезапустите zames, чтобы сменить браузер.',
    en: 'Chat provider: {v}. Restart zames to switch the browser.',
  },
  'provider.usage': {
    ru: 'Использование: /provider <deepseek|qwen> | /provider login | /provider status',
    en: 'Usage: /provider <deepseek|qwen> | /provider login | /provider status',
  },
  'provider.handoff_saved': {
    ru: 'Контекст текущего чата сжат и сохранён для {v}. Он подхватится при следующем запуске.',
    en: 'The current chat was summarized and saved for {v}. It will be carried over on the next launch.',
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
}
