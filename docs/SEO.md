# SEO and discoverability

How zames_pro is made findable by search engines (Google, Yandex, Bing) and
by AI assistants / LLM crawlers (ChatGPT, Claude, Perplexity, Copilot,
Gemini). Edit this file when changing any of the surfaces below.

## The discoverability surfaces

Every place a crawler or an LLM can read metadata about the project, and what
feeds it:

| Surface                | File                                                                                                                                                                                                                                                                                    | Who reads it                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| npm package page       | `package.json` (`description`, `keywords`, `repository`, `homepage`, `bugs`, `author`, `funding`) + `README.md`                                                                                                                                                                         | npm search, Google, LLM answers about npm packages                 |
| GitHub repository page | `README.md` (generated), `package.json`, repository **topics**                                                                                                                                                                                                                          | GitHub search, Google, Yandex, LLM training/indexing               |
| AI crawler map         | `llms.txt` (short, curated)                                                                                                                                                                                                                                                             | assistants following the llms.txt convention                       |
| AI full text           | `llms-full.txt` (whole English README)                                                                                                                                                                                                                                                  | assistants that want the full docs in one context                  |
| Structured citation    | `CITATION.cff`                                                                                                                                                                                                                                                                          | GitHub's "Cite this repository" button, scholarly tools            |
| Sponsorship            | `.github/FUNDING.yml`                                                                                                                                                                                                                                                                   | the GitHub Sponsor button                                          |
| Documentation site     | `docs/_config.yml`, the two landing pages (`docs/index.md`, `docs/ru/index.md`), the `docs/*.md` reference pages and the generated `docs/readme/{en,ru}.md`; layouts in `docs/_layouts/`, design in `docs/assets/site.css`; `docs/robots.txt` (GitHub Pages, Jekyll + `jekyll-sitemap`) | Google, Yandex, Bing, LLM crawlers (own URLs, not just the README) |

CI keeps the generated surfaces honest: the `Docs up to date` step runs
`npm run build:readme -- --check` and `npm run build:llms -- --check`, so a
hand edit of `README.md`/`llms.txt` (or a `docs/` change without a rebuild)
fails the build.

## Sources of truth (the generated files are never edited directly)

- `docs/readme.en.md` and `docs/readme.ru.md` — the README sources; `npm run
build:readme` assembles `README.md` from them (the Russian translation is a
  folded `<details>` block inside the same file, so npm and GitHub show both
  languages).
- `docs/llms.txt` — the SOURCE of the short map; `npm run build:llms` copies it
  to `./llms.txt` and regenerates `./llms-full.txt` from the English README.
- `test/readme-built.test.ts` and `test/llms-txt.test.ts` fail if a generated
  file drifts from its source.

## Repository topics

GitHub topics are a real ranking signal in GitHub search and are indexed by
Google. The canonical list is in `docs/seo-topics.json`; topics are repository
METADATA (not a file), so they are applied with the GitHub CLI — a command the
agent runs, there is no manual step:

```bash
npm run seo:topics                # prints the gh command
npm run seo:topics -- --apply     # applies it with the GitHub CLI
```

## Keywords policy

Keywords live in `package.json` `keywords` (npm search) and as plain phrases in
the README's FAQ and "Keywords and alternatives" section (natural language for
search engines and LLMs). Keep them TRUE: no keyword stuffing, no claims about
features the project does not have. The list currently targets:

- category: terminal coding agent, AI coding agent, CLI coding assistant,
  autonomous coding agent, AI code assistant;
- differentiator: no API key, free AI coding assistant, browser automation;
- backends: DeepSeek, Qwen, GLM / z.ai;
- neighbours: Claude Code, OpenAI Codex CLI, Cursor, Cline, Aider.

## Checklist when adding a feature

1. Add the user-visible text to the README source (`docs/readme.en.md` and
   `docs/readme.ru.md`), not to `README.md`.
2. If it is a searchable capability, add a keyword to `package.json`.
3. If it changes what an LLM should know, update `docs/llms.txt`.
4. Run `npm run build:readme && npm run build:llms && npm test`.

## Documentation site (GitHub Pages)

`docs/` is also the source of the public documentation site: GitHub Pages is
configured to publish from the `docs/` folder of `master` (Settings → Pages →
Source: "Deploy from a branch", branch `master`, folder `/docs`). Enabling
Pages is a one-time repository setting (or `gh api`); there is no build step
and no new dependency.

What the site is made of:

| File                                                               | Role                                                                                                                                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/_config.yml`                                                 | Site title, description, `theme: null` (no Jekyll theme — it would override the custom layouts), `jekyll-sitemap` + `jekyll-seo-tag`.                                                         |
| `docs/_layouts/default.html`                                       | The shared shell: sticky header with the EN/RU switch, footer, OpenGraph/Twitter meta, canonical URL.                                                                                         |
| `docs/_layouts/doc.html`                                           | The documentation page shell (`<article class="doc">` + a page-to-page nav).                                                                                                                  |
| `docs/assets/site.css`                                             | The whole design system (dark/light by `prefers-color-scheme`, hero, cards, steps, code blocks).                                                                                              |
| `docs/assets/favicon.svg`                                          | The site icon.                                                                                                                                                                                |
| `docs/index.md` / `docs/ru/index.md`                               | The landing pages (EN at `/`, RU at `/ru/`), cross-linked in front matter via `alt_url`.                                                                                                      |
| `docs/{commands,configuration,mcp,troubleshooting}.md` + `*-ru.md` | The reference pages; the EN/RU pair points at each other with `alt_url`.                                                                                                                      |
| `docs/readme/en.md`, `docs/readme/ru.md`                           | **Generated** pages for the two READMEs (`npm run build:readme`), so the site shows the full overview without the GitHub-only hero/badges and with every link pointing at the site or GitHub. |
| `docs/robots.txt`                                                  | Points crawlers at `/sitemap.xml` (generated by the plugin).                                                                                                                                  |

The README **sources** (`docs/readme.en.md`, `docs/readme.ru.md`) stay plain
README files with the `<!-- SWITCHER -->` marker — they are not pages, and
`test/docs-page.test.ts` fails if front matter leaks into them. That test also
pins: every published page has `layout` + `title`, the EN/RU pairs point at
each other, every landing-page link targets an existing page, `robots.txt`
matches the canonical host, and `docs/readme/*.md` match `buildDocsPages()`.

Canonical URL: <https://viqto0r.github.io/zames_pro/> (also set as
`homepage` in `package.json` and linked from the README). The Russian landing
page is <https://viqto0r.github.io/zames_pro/ru/>.
