# BACKLOG

Задачи по багам и инфраструктуре zames. Обновляется по мере выполнения.

## P0 — баги, ломающие работу

- [x] **Моргание терминала (Tabby) при вводе символов** — исправлено
  Инкрементальный рендер: при неизменном статусе перерисовываются только
  строки ввода, статусный блок не стирается. `test/incremental-render.test.ts`.

- [x] **Дублирование строки «пауза Nс перед отправкой»** — исправлено
  Причина — autowrap: строка статуса добивалась до полной ширины терминала,
  и терминалы с autowrap (Tabby/iTerm/Windows Terminal) переносили курсор,
  из-за чего следующий erase попадал не туда и статус наслаивался. Теперь
  строка держит одну колонку свободной (`cols-1`).
  `test/no-stack-render.test.ts`.

- [x] **Зависание после `Messages too frequent. Try again later.`** — исправлено
  Ожидание лимита теперь анимировано через `onSendPause` (живой отсчёт),
  прерывается по Esc; классификация тостов rate-limit/server-busy независима
  и читается на каждом тике. `test/rate-limit-during-gen.test.ts`.

- [x] **Resume чата открывает новое окно браузера** — исправлено
  `restart()` переиспользует профиль (`_launchOnce()` на месте), не зовёт
  `launch()` с очисткой; рестарт срабатывает только на реально потерянную
  страницу (`Target page, context or browser has been closed`).

- [x] **Esc не прерывает долгий инструмент** — частично исправлено
  `editor.busy = true` теперь на всю задачу (не только /init и /self-fix),
  поэтому Esc/Ctrl+C вызывает `stopGeneration()`. После выполнения
  инструмента `runAgentLoop` проверяет `browser._abort`/`_stopped` и
  завершает цикл, НЕ отправляя результат в модель.
  `test/abort-during-tool.test.ts`.
  ОГРАНИЧЕНИЕ: сам дочерний процесс (Bash/npm test) дорабатывает до конца
  — убить произвольный `exec` извне нельзя (см. задачу ниже).

- [ ] **Прерывание дочернего процесса Bash по Esc**
  Сейчас Esc останавливает агент ПОСЛЕ завершения команды, но сама команда
  (например `npm test`) досчитывает до конца. Нужно прокинуть отмену в
  `Bash`-инструмент (Node `child_process` + AbortController) и убивать
  процесс по `browser._abort`/`_stopped`.

- [ ] **После resume модель теряет контекст («I don't have the repo»)**
  В логе `zames-2026-09-28T14-48-12`: после `resume_chat` модель ответила
  «I can't do most of what you're asking… I don't have the repo». Значит в
  чат ушёл не тот контекст / system-prompt не был переотправлен, а модель
  получила только огрызок. Проверить порядок при resume: `freshChat=false`,
  `sendSystemPrompt=resendPrompt`. Возможно, надо всегда переотправлять
  system-prompt (или его краткую версию) при первом сообщении в resume-чате.

- [ ] **`killStaleChrome` может убить чужой браузер (Windows)**
  Убивает ВСЕ chrome с `/.zames/profile`, включая чужой запущенный агент.
  Ограничить только процессами, стартовавшими до этого инстанса.


## P1 — инфраструктура качества

- [x] **ESLint с правилом на мёртвый/недостижимый код**
  Подключён ESLint 9 + typescript-eslint. Так как проект собирается
  TypeScript 7, а typescript-eslint пока не поддерживает TS 7 API,
  линтер запускается через `scripts/eslint-ts6.mjs` — он на время процесса
  подменяет модуль `typescript` на `typescript-6` (side-by-side, как советует
  сам typescript-eslint). Включены `no-unreachable`, `no-constant-condition`,
  `no-useless-assignment`, `prefer-const`, `@typescript-eslint/no-unused-vars`.
  Починены все реальные находки. Скрипт: `npm run lint` / `lint:fix`.

- [x] **Prettier + форматирование**
  Подключён Prettier (`.prettierrc`: 2 пробела, single quotes, no semi,
  trailingComma all, printWidth 80), интегрирован с ESLint через
  `eslint-config-prettier`. Весь `src/` и `test/` отформатированы.
  Скрипты: `npm run format` / `format:check`.

- [x] **CI: lint + format:check**
  Добавлены шаги `npm run lint` и `npm run format:check` в
  `.github/workflows/test.yml`. Плюс добавлен `.npmrc` с
  `legacy-peer-deps=true`: typescript-eslint 8 требует TS <6.1, а проект
  собирается TS 7, поэтому чистая `npm install` без этого флага падала с
  ERESOLVE (уронило пайплайны v2.21.0).

## Заметки

- Правило проекта: НЕ трогать чужой запущенный браузер / профиль (см. AGENTS.md).
- После каждой задачи: `npm run typecheck`, `npm test`, коммит, пуш.
