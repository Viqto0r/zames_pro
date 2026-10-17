# QUEUE — журнал баг-хантинга zames_pro

Бесконечный цикл: каждый такт — выбрать участок, найти реальный баг,
написать падающий тест (RED), починить (GREEN), прогнать гейты, закоммитить.
НЕ пушить, НЕ поднимать версию.

Статусы: `в работе` | `исправлено` | `чисто` (проверено, багов нет).

---

## Журнал тактов

### Такт 1 (2026-10-17) — чисто

Проверены участки TUI / парсера / сессий: `src/tui/log-window.ts`,
`src/tui/InputLine.tsx` (пагинация и подсветка подсказок),
`src/tui/FullScreenApp.tsx` (скролл/подсветка), `src/tui/StatusBar.tsx`
(ширина бейджей), `src/input/suggest.ts`, `src/input/layout.ts`.
Гейты (`npm test`, `typecheck`, `lint`, `format:check`, `build`) — зелёные.
Реального дефекта не найдено.

---

## Покрытые области (не повторять без причины)

- `src/tui/log-window.ts` — оконная разбивка лога по строкам.
- `src/tui/InputLine.tsx` — пагинация/подсветка списка подсказок.
- `src/input/suggest.ts` — сопоставление/окно/дополнение слэш-команд.
- `src/tui/StatusBar.tsx` — ширина и приоритет бейджей.

---

## Чисто (проверено, багов не найдено)

- `src/tui/log-window.ts` — windowByRows/totalRows/entryRows (2026-10-17).
- `src/tui/InputLine.tsx` — suggestOffset и подсветка (2026-10-17).
- `src/input/suggest.ts` + `src/input/layout.ts` — границы/перенос (2026-10-17).
- `src/tui/StatusBar.tsx` — badgeTextWidth/Badges (2026-10-17).
