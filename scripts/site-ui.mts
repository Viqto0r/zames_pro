/**
 * The Russian half of the published pages.
 *
 * Why not a second Markdown file per page: docs/commands-ru.md, docs/themes-ru.md
 * and the generated docs/readme/ru.md already carry the body of their own page.
 * What is missing there is everything the LAYOUT prints — the nav labels, the
 * hero, the card grids, the theme gallery legend. Copying the whole page into a
 * second .md would drift on the first edit, so only these blocks are translated
 * here and the pages pick them up through `{% include %}`.
 *
 * Keys are per page, so a phrase reused on two pages is stored twice on
 * purpose: a page must be translatable without touching the other one.
 */
// Kept as a local alias, not imported from src/i18n.ts: scripts/ has no build
// step of its own, and this file is read by `tsx` from the repo root where the
// `src/*.js` specifiers only resolve after a build. The set of locales is
// pinned by test/docs-bilingual.test.ts instead.
type Locale = 'ru' | 'en'

export interface ChangelogUi {
  title: string
  description: string
  lead: string
  count: (n: number) => string
  jump: string
  unavailable: string
}

// A label map keyed by the GROUP HEADINGS of CHANGELOG.md. An unknown heading
// (a new group added by a release) falls back to the English text instead of
// disappearing — a missing translation must never hide a release note.
const CH_GROUPS: Record<string, string> = {
  Added: 'Добавлено',
  Changed: 'Изменено',
  Fixed: 'Исправлено',
  Removed: 'Удалено',
  Deprecated: 'Устарело',
  Security: 'Безопасность',
  Other: 'Прочее',
}

const RU = {
  changelog: {
    title: 'История изменений',
    description:
      'Все версии zames_pro по порядку: что добавлено, исправлено и изменено — от свежего релиза до первого.',
    lead: 'Каждый релиз zames_pro: самый свежий сверху, старые версии можно развернуть, а список версий в начале страницы ведёт сразу к нужной.',
    count: (n: number) => (n === 1 ? 'версия' : 'версий: ' + n),
    jump: 'К версии',
    unavailable:
      'Файл CHANGELOG.md не найден. Историю изменений можно посмотреть на GitHub.',
  } satisfies ChangelogUi,
  themes: {
    legend:
      'Все палитры идут в комплекте с агентом. Нажмите на плитку, чтобы открыть скриншот в полном размере.',
  },
  landing: {
    docsHeading: 'Документация',
    docsLead: 'Полный справочник — в репозитории и на этом сайте.',
    cards: [
      [
        '/readme/ru',
        'README',
        'Полный обзор: вход в аккаунт, провайдеры, использование, опции и FAQ.',
      ],
      [
        '/commands-ru',
        'Команды и инструменты',
        'Все инструменты и слэш-команды, которые понимает агент.',
      ],
      [
        '/configuration-ru',
        'Конфигурация и темы',
        'Все настройки, меню /config и 29 встроенных палитр.',
      ],
      [
        '/mcp-ru',
        'MCP',
        'Подключение внешних серверов инструментов с безопасным примером Playwright MCP.',
      ],
      [
        '/troubleshooting-ru',
        'Решение проблем',
        'Вход и капча, headless 403, рейт-лимиты, отсутствующие библиотеки.',
      ],
      [
        '/themes-ru',
        'Темы',
        'Все 29 цветовых тем со скриншотами настоящих сессий.',
      ],
      [
        '/changelog-ru',
        'История изменений',
        'Все версии по порядку: что добавлено, исправлено и изменено.',
      ],
      [
        '/',
        'English version',
        'Overview, commands, configuration and changelog in English.',
      ],
    ],
  },
  docsNav: {
    changelog: 'История изменений',
  },
} satisfies SiteUi

export interface SiteUi {
  changelog: ChangelogUi
  themes: { legend: string }
  landing: {
    docsHeading: string
    docsLead: string
    // [href, heading, blurb] — a tuple, so a card cannot lose its link or its
    // title and still typecheck.
    cards: ReadonlyArray<readonly [string, string, string]>
  }
  docsNav: { changelog: string }
}

const EN: SiteUi = {
  changelog: {
    title: 'Changelog',
    description:
      'Every zames_pro release in order: what was added, fixed and changed — from the latest release back to the first one.',
    lead: 'Every zames_pro release: the newest on top, older versions expandable, and the version list at the start of the page jumps straight to one.',
    count: (n: number) => (n === 1 ? 'release' : 'releases: ' + n),
    jump: 'Jump to a version',
    unavailable:
      'CHANGELOG.md was not found. The release history is also on GitHub.',
  } satisfies ChangelogUi,
  themes: {
    legend:
      'Every palette ships with the agent. Click a tile to open the screenshot full size.',
  },
  landing: {
    docsHeading: 'Documentation',
    docsLead: 'The full reference lives in the repository and on this site.',
    cards: [
      [
        '/readme/en',
        'README',
        'The complete overview: signing in, providers, usage, options and FAQ.',
      ],
      [
        '/commands',
        'Commands & tools',
        'Every tool and slash command the agent understands.',
      ],
      [
        '/configuration',
        'Configuration and themes',
        'All settings, the /config menu and the 29 bundled palettes.',
      ],
      [
        '/mcp',
        'MCP',
        'Connect external tool servers, with a safe Playwright MCP example.',
      ],
      [
        '/troubleshooting',
        'Troubleshooting',
        'Sign-in and captcha, headless 403, rate limits, missing libraries.',
      ],
      [
        '/themes',
        'Themes',
        'All 29 color themes, each with a real session screenshot.',
      ],
      [
        '/changelog',
        'Changelog',
        'Every release in order: what was added, fixed and changed.',
      ],
      [
        '/ru/',
        'Русская версия',
        'Обзор, команды, конфигурация и решение проблем на русском.',
      ],
    ],
  },
  docsNav: {
    changelog: 'Changelog',
  },
}

export const SITE_UI: Record<Locale, SiteUi> = { ru: RU, en: EN }

export function siteUi(locale: Locale): SiteUi {
  return SITE_UI[locale] ?? EN
}

export function changelogGroupLabel(locale: Locale, name: string): string {
  return locale === 'ru' ? CH_GROUPS[name] || name : name
}
