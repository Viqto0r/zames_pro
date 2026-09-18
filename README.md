# zames_pro

Terminal coding agent, работающий поверх chat.deepseek.com через Playwright.
По духу похож на Claude Code / Codex CLI: запускается в текущей директории, читает и правит файлы, запускает команды, коммитит в git.

## Требования

- Node.js >= 18
- Google Chrome или Chromium (используется через Playwright)
- Аккаунт DeepSeek (вход выполняется вручную в открывшемся браузере при первом запуске)

## Установка

```bash
npm install -g zames_pro
npx playwright install chromium
```

## Запуск

Перейди в папку проекта и запусти:

```bash
zames
```

Агент работает в директории запуска и не может выходить за её пределы (sandbox).

### Опции

```
zames --task <текст задачи>
zames --headless
zames --debug
zames --dir <путь>
zames --help
```

## Конфигурация

Глобальный конфиг: `~/.zames/config.json`
Локальный (в проекте): `.zamesrc.json`

Данные агента хранятся в `~/.zames`: профиль браузера, логи, история undo, снапшоты self-review.

## Лицензия

MIT
