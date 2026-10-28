// First-run wizard (N19). A fresh install has no config yet, so these lines
// are the FIRST the operator ever sees: they must explain the three choices
// (language, backend, sign-in) without assuming any prior knowledge.
export const wizardMessages: Record<string, { ru: string; en: string }> = {
  'wizard.welcome': {
    ru: 'Первый запуск. Настроим три вещи: язык, провайдер и вход. Enter — значение по умолчанию.',
    en: 'First run. Three quick choices: language, provider and sign-in. Enter accepts the default.',
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
