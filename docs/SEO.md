# SEO and discoverability

How zames_pro is made findable by search engines (Google, Yandex, Bing) and
by AI assistants / LLM crawlers (ChatGPT, Claude, Perplexity, Copilot,
Gemini). Edit this file when changing any of the surfaces below.

## The discoverability surfaces

Every place a crawler or an LLM can read metadata about the project, and what
feeds it:

| Surface                | File                                                                                                                    | Who reads it                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| npm package page       | `package.json` (`description`, `keywords`, `repository`, `homepage`, `bugs`, `author`, `funding`) + `README.md`         | npm search, Google, LLM answers about npm packages                 |
| GitHub repository page | `README.md` (generated), `package.json`, repository **topics**                                                          | GitHub search, Google, Yandex, LLM training/indexing               |
| AI crawler map         | `llms.txt` (short, curated)                                                                                             | assistants following the llms.txt convention                       |
| AI full text           | `llms-full.txt` (whole English README)                                                                                  | assistants that want the full docs in one context                  |
| Structured citation    | `CITATION.cff`                                                                                                          | GitHub's "Cite this repository" button, scholarly tools            |
| Sponsorship            | `.github/FUNDING.yml`                                                                                                   | the GitHub Sponsor button                                          |
| Documentation site     | `docs/_config.yml`, `docs/index.md`, the `docs/*.md` pages, `docs/robots.txt` (GitHub Pages, Jekyll + `jekyll-sitemap`) | Google, Yandex, Bing, LLM crawlers (own URLs, not just the README) |

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
Source: "Deploy from a branch", branch `master`, folder `/docs`). Jekyll
renders the Markdown as-is; `docs/_config.yml` sets the title, the theme
(`jekyll-theme-primer`) and the `jekyll-sitemap` plugin, `docs/index.md` is the
landing page that links every EN/RU page, and `docs/robots.txt` points
crawlers at the sitemap (`/sitemap.xml`, generated by the plugin).

Canonical URL: <https://viqto0r.github.io/zames_pro/> (also set as
`homepage` in `package.json` and linked from the README). Enabling Pages is a
one-time repository setting (or `gh api`); no build step and no new dependency
is involved.
