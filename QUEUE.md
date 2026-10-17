# QUEUE — журнал баг-хантинга zames_pro

Бесконечный цикл: каждый такт — выбрать участок, найти реальный баг,
написать падающий тест (RED), починить (GREEN), прогнать гейты, закоммитить.
НЕ пушить, НЕ поднимать версию.

Статусы: `в работе` | `исправлено` | `чисто` (проверено, багов нет).

---

## Журнал тактов

### Такт 1 (2026-10-17) — чисто

Проверены `src/tui/log-window.ts`, `src/tui/InputLine.tsx`,
`src/tui/FullScreenApp.tsx`, `src/tui/StatusBar.tsx`, `src/input/suggest.ts`,
`src/input/layout.ts`. Реального дефекта не найдено.

### Такт 2 (2026-10-17) — исправлено

**Цель:** слэш-команды и локализация (`src/i18n/*`, README).

**Баг:** команда `/resume <n>` была УДАЛЕНА из диспетчера (остался только
`/resume-id <id>`), но подсказка после `/sessions` (`sessions.restore_hint`)
всё ещё говорила «/resume <n> after /chats» — оператор вводил мёртвую
команду и получал `Unknown command`. Сторож `i18n-unused` этого не ловил
(он проверяет только факт ССЫЛКИ на ключ, а не правдивость текста), а e2e
тест `--help` сканировал только `--help`. Та же устаревшая строка была в
README.md и в сгенерированных docs/readme.{en,ru}.md.

**Фикс:**
- `src/i18n/self-review.ts` — `sessions.restore_hint` теперь указывает на
  живой путь `/resume-id <id>` (или выбор из списка `/sessions`).
- `README.md`, `docs/readme.en.md`, `docs/readme.ru.md` — та же правка.

**Тест:** `test/sessions-restore-hint.test.ts` (RED до фикса — обе локали
падали, GREEN после): проверяет и конкретный ключ, и ЧЕРНЫЙ СПИСОК по всему
CATALOG на упоминание удалённой формы `/resume <n>`.

**Гейты:** `npm test` 1083 теста (1073 pass, 0 fail, 10 skip),
`typecheck`, `lint`, `format:check`, `build` — зелёные.

**Коммит:** `37d6e55`.

---

### Такт 3 (2026-10-17) — исправлено

**Цель:** локализация ru/en в Ink-диалогах TUI.

**Баг:** панель подсказок клавиш (`HintBar`) в `SelectList`,
`ConfigMenu` и `ConfirmDialog` — а также метка «← текущая» в выборе модели
`/model` — были захардкожены по-русски. Оператор с `ui.locale=en` видел
русскую строку подсказок в каждом модальном меню; переводчик не мог её
поправить. Нарушение правила «операторский текст — только через CATALOG».

**Фикс:**
- `src/i18n/deepseek.ts` — новые ключи `tui.hint.*` (select/edit/ok/cancel/
  search/reset/change/quit) и `tui.list.current` (ru+en).
- `src/tui/SelectList.tsx`, `ConfigMenu.tsx`, `ConfirmDialog.tsx` — prop
  `locale`, подсказки читаются через `translate(locale)`.
- `run-select.tsx`, `run-confirm.tsx`, `/config`-меню, permission-ask и
  пикер модели в `index.ts` — прокинут `currentLocale`.

**Тест:** `test/tui-hints-locale.test.ts` (RED до фикса — все три
компонента падали с русскими метками, GREEN после): сканирует исходники
компонентов и падает на любом кириллическом label в `hints={[...]}`.

**Гейты:** `npm test` 1087 тестов (1077 pass, 0 fail, 10 skip),
`typecheck`, `lint`, `format:check`, `build` — зелёные.

**Коммит:** см. `git log -1`.

---

## Покрытые области (не повторять без причины)

- `src/tui/log-window.ts` — оконная разбивка лога по строкам (2026-10-17).
- `src/tui/InputLine.tsx` — пагинация/подсветка подсказок (2026-10-17).
- `src/input/suggest.ts` + `src/input/layout.ts` (2026-10-17).
- `src/tui/StatusBar.tsx` — ширина/приоритет бейджей (2026-10-17).
- `src/i18n/self-review.ts` + README — устаревшие подсказки команд (2026-10-17).

---

## Чисто (проверено, багов не найдено)

- `src/tui/log-window.ts` (2026-10-17).
- `src/tui/InputLine.tsx` (2026-10-17).
- `src/input/suggest.ts` + `src/input/layout.ts` (2026-10-17).
- `src/tui/StatusBar.tsx` (2026-10-17).
