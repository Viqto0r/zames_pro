// First-run wizard (N19). A fresh install has no config yet, so these lines
// are the FIRST the operator ever sees: they must explain the three choices
// (language, backend, sign-in) without assuming any prior knowledge.
export const wizardMessages: Record<string, { ru: string; en: string }> = {
  'wizard.welcome': {
    ru: 'Первый запуск. Настроим две вещи: язык интерфейса и провайдера; вход выполнится при первой задаче. Enter — значение по умолчанию.',
    en: 'First run. Two quick choices: interface language and provider; the sign-in happens on the first task. Enter accepts the default.',
  },
  'wizard.language': {
    ru: 'Язык интерфейса [en/ru] (en):',
    en: 'Interface language [en/ru] (en):',
  },
  'wizard.provider': {
    ru: 'Провайдер [deepseek/qwen/glm] (deepseek): ',
    en: 'Provider [deepseek/qwen/glm] (deepseek): ',
  },
  'wizard.hint': {
    ru: 'Готово. Дальше — /help; сменить настройки можно через /config.',
    en: 'Done. Next: /help; change these later with /config.',
  },
  'wizard.skipped': {
    ru: 'Мастер пропущен — используются значения по умолчанию (английский, DeepSeek).',
    en: 'Wizard skipped — using the defaults (English, DeepSeek).',
  },
}
