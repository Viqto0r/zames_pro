# Text audit — protocol for an unattended `/loop` run

Goal: walk the human-readable texts of zames_pro one file per step, find a
factual / wording defect, FIX it together with its source of truth, verify,
commit and PUSH to `master` (`git push origin master`); do NOT bump the version.

Now that the CODE and the CODE COMMENTS are audited, this protocol covers
everything else: user docs, dev docs, the agent instructions, the bundled skills,
GitHub metadata, the package metadata and the UI localization (`ru` + `en`).

Keep your journal in `QUEUE.md` (it is gitignored) under a `### Text-audit step
N (YYYY-MM-DD) — <file>` entry, and keep the "Covered areas" list there up to date
so the next step does not repeat work. `QUEUE.md` is the QUEUE of texts still to
check and the journal of what was checked; it may be truncated at any time (see
section 7).

## 1. Scope — the files that carry PROSE

Source of truth first, generated files last (never hand-edit a generated one):

| Kind               | Files                                                                                                                                                                    | Edit?                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| README sources     | `docs/readme.en.md`, `docs/readme.ru.md`                                                                                                                                 | yes                                                             |
| README (generated) | `README.md`                                                                                                                                                              | no — rebuild via `npm run build:readme`                         |
| LLM map            | `docs/llms.txt`                                                                                                                                                          | yes; root `llms.txt` + `llms-full.txt` via `npm run build:llms` |
| User docs          | `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CITATION.cff`                                                                                                   | yes                                                             |
| Discoverability    | `docs/SEO.md`, `docs/seo-topics.json`, `package.json` (`description`, `keywords`), `.github/FUNDING.yml`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md` | yes                                                             |
| Dev docs           | `DEVELOPING.md`, `docs/DESIGN-NOTES.md`, `docs/TEXT-AUDIT.md` (this file)                                                                                                | yes                                                             |
| Agent rules        | `AGENTS.md`                                                                                                                                                              | yes (only if the text is WRONG, not to restyle)                 |
| Bundled skills     | `skills/*/SKILL.md`                                                                                                                                                      | yes (user-visible text)                                         |
| UI localization    | `src/i18n/*.ts` (`ru` + `en` for EVERY key)                                                                                                                              | yes                                                             |
| Config labels      | `src/i18n/config.ts` vs `CONFIG_SCHEMA` in `src/config.ts`                                                                                                               | yes                                                             |
| CLI/help text      | `src/i18n/help.ts` vs the keys used in `src/index.ts` and `src/commands.ts` (`SLASH_COMMANDS`)                                                                            | yes                                                             |
| Terminal chrome    | `src/tui/*.tsx`, `src/spinner.ts`, `src/banner.ts` — only strings that go through `t()`                                                                                  | yes                                                             |

OUT of scope: code and code comments (already audited), `CHANGELOG.md` history
(append-only), `QUEUE.md`, `BACKLOG.md`, `dist/`, `node_modules/`.

## 2. One step = one file (or one tightly related pair)

At the START of every step:

1. `git status --short` — must be clean. If dirty, finish or revert first.
2. Read `QUEUE.md` "Covered areas" and the last few steps; pick the next file
   from the scope table that is NOT covered yet. Order: user-facing first
   (readme.en → readme.ru → llms.txt → CONTRIBUTING/SECURITY/CITATION →
   package.json/SEO → DEVELOPING/DESIGN-NOTES → AGENTS.md → skills →
   `src/i18n/*` one section file per step).

Then AUDIT the chosen file against the sources of truth below.

## 3. What counts as a defect (be strict, do not invent)

1. **Factually wrong.** A claim contradicted by the code or config. Check
   every number and path: Node version (`package.json` `engines` vs README vs
   `llms.txt` vs `CONTRIBUTING.md`), ports/paths (`~/.zames/...`), default
   values (`DEFAULTS` in `src/config.ts`: `minSendIntervalMs`, `contextLimit`,
   `answerTimeoutMs`, `maxSubagents`, `sendTelemetry`, `ui.mouseScroll` …),
   provider list (`PROVIDERS` in `src/providers.ts` — ids, labels, profiles),
   tool list (`src/tools.ts`, `src/extraTools.ts`, `src/gitTools.ts`,
   `src/web.ts`), slash commands (`SLASH_COMMANDS` in `src/commands.ts`).
2. **Describes something that does not exist.** A command, option, config key,
   env variable, file or tool that is not in the code. Check with
   `grep -rn` before believing the text; check the KEY in `CONFIG_SCHEMA`
   and the flag in `src/cli-args.ts`.
3. **Missing what exists.** A user-visible command/config key/flag present in
   the code and absent from the README's lists (e.g. a new `help.cmd.*`
   without a README entry).
4. **Stale after a rename.** An old path/default/name ("two providers" when
   there are three, a removed flag, a moved module).
5. **Duplicates.** The same paragraph twice in one file, or two sections
   saying the same thing where one can point at the other. In `src/i18n` —
   two keys with identical `ru` AND `en` text where one call site could reuse
   the other (report, fix only if the merge is safe).
6. **ru/en drift.** A key whose `ru` and `en` say DIFFERENT things (not just
   different words: a number, a default, a command name, a file path, an
   instruction missing in one language). Check every key you touch; when
   auditing an i18n file, compare the two strings side by side.
7. **Broken structure.** A heading without a matching TOC entry or vice versa,
   a dead relative link (`[x](CONTRIBUTING.md)` with no such file), a code
   fence that is not closed, a table with a broken row, an anchor that does
   not exist (`#readme-ru`).
8. **Language policy violation.** Agent-facing text (tool descriptions, tool
   results, system prompt, MCP descriptions) must be ENGLISH; operator-facing
   text must go through `t()` and have BOTH `ru` and `en`. Cyrillic prose in an
   agent-facing file is a defect (`test/agent-facing-english.test.ts`).
9. **Typos / broken grammar / doubled words** ("the the", "файл файл"),
   wrong plural, mixed language inside one sentence.

NOT a defect: style preference, a shorter way to say the same thing, a
comment, the historical `CHANGELOG.md`. Do not "polish" — the risk of a
needless diff is higher than the gain. When unsure whether a claim is wrong,
VERIFY against the code; if it cannot be verified, leave it and note it in the
journal instead of guessing.

## 4. Fix rules

- Fix the SOURCE (`docs/readme.*.md`, `docs/llms.txt`), then regenerate:
  `npm run build:readme && npm run build:llms`. Never edit `README.md`,
  `llms.txt` or `llms-full.txt` by hand — `test/readme-built.test.ts` and
  `test/llms-txt.test.ts` fail on drift.
- Fix BOTH languages in the same step. If the `ru` text was right and the `en`
  wrong, fix only the wrong one — but re-read the other to be sure.
- For an i18n key: fix `src/i18n/<section>.ts` (both languages), and check the
  call site still passes the params the template uses (`{v}`, `{n}`, `{id}` …).
- A config label in `src/i18n/config.ts` must match the actual DEFAULT in
  `src/config.ts` (e.g. "off = select without Shift" vs `mouseScroll: true`).
- If the defect is in CODE (a wrong default, a missing flag), fix the code and
  the doc together — a doc that matches a bug is still wrong.
- Keep the diff MINIMAL: one defect family per commit. Do not reformat the
  file, do not re-wrap paragraphs that were fine, do not reorder sections.

## 5. Verify before reporting (mandatory)

Run ALL of these and paste the outcome into the journal entry:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

Plus, when you touched a generated surface:

```bash
npm run build:readme && npm run build:llms && npm test   # drift tests
```

When you touched an i18n key, also run the guard tests explicitly:

```bash
npx tsx --test test/i18n.test.ts test/i18n-live.test.ts test/i18n-unused.test.ts test/agent-facing-english.test.ts
```

A step whose gates are red is NOT done: either fix it or revert the step.

## 6. Journal + commit

- Append to `QUEUE.md` under `### Text-audit step N (YYYY-MM-DD) — <file>`:
  what was checked, what was found (file:line, the wrong text and why it is
  wrong), the fix, the gates, the commit SHA.
- Add the file to "Covered areas" so the next step skips it.
- Commit with a conventional subject: `docs(readme): fix the Node.js version`,
  `fix(i18n): align the ru/en text of …`. One commit per step.
- Then PUSH it: `git push origin master`. If the push is rejected (the pre-push
  hooks run lint + format:check + typecheck + build, or it is a non-fast-forward),
  fix the cause and push again — NEVER force-push.
- Do NOT run `npm run release`, do NOT touch `package.json` `version`.

## 7. Keeping QUEUE.md usable (it is a QUEUE, not an archive)

`QUEUE.md` is gitignored and has grown to thousands of lines of finished bug-hunt
steps. It is a QUEUE of what is still to be checked plus a SHORT journal; it is not
an archive. Rules:

- The "Covered areas" list and the last few `Text-audit step` entries are what
  matter; older bug-hunt steps are HISTORY and may be deleted.
- When the file is longer than ~2000 lines (or before a long `/loop` run),
  REPLACE it with a fresh skeleton: a short "Covered areas (texts)" list copied
  from the old file plus the current queue table. Nothing is lost: the commits
  and `CHANGELOG.md` are the real history.
- Never let the journal be the reason a step is skipped: an unreadable queue is
  worse than no queue.

## 8. The `/loop` command to start it

Run this ONCE in the project directory (the interval is a suggestion — a step
with a full `npm test` takes minutes, so do not go below `15m`):

```
/loop 20m Text audit, one step. Read docs/TEXT-AUDIT.md and follow it exactly: pick the next NOT-yet-covered file from its scope table (skip the ones listed under "Covered areas" in QUEUE.md), audit it against the code as the source of truth, fix ONE defect family in the source file(s) plus both languages, regenerate the generated files, run the gates (typecheck, test, lint, format:check, build), append a `### Text-audit step N` entry to QUEUE.md with the finding + gates + commit SHA, update the "Covered areas" list, commit (docs:/fix: subject) and push to master (git push origin master). Do NOT bump the version. If the file is clean, add it to "Covered areas", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every file in the scope table is covered.
```

One-liner variant if the task text must fit on one line:

```
/loop 20m Text audit step: read docs/TEXT-AUDIT.md and follow it exactly (pick the next uncovered file, audit vs code, fix one defect family in source+both languages, rebuild generated files, run gates, journal in QUEUE.md, update Covered areas, commit and push to master, no version bump).
```

## 9. Suggested first passes (highest value)

These are the places where a drift is most likely, because the code has
changed many times since the text was written — check them early:

1. `docs/readme.en.md` + `docs/readme.ru.md`: the Node.js requirement (the
   `engines` field and the CI pin are the truth), the provider section (three
   backends, per-provider profiles, GLM headed), every default quoted from
   `DEFAULTS` (throttle, context window, timeouts, `ui.mouseScroll`,
   `browser.sendTelemetry`), the slash-command list, the CLI options block and
   the `/config` paragraph (where values are written: the HOME config, not
   `.zamesrc.json`).
2. `docs/llms.txt`: the stack line, the capability list, the FAQ answers.
3. `CONTRIBUTING.md`: requirements, the checks list, the commit/release flow.
4. `CITATION.cff`: `version` / `date-released` vs `package.json` (check whether
   `scripts/release.mts` updates it; if not, it drifts every release).
5. `src/i18n/config.ts` vs `CONFIG_SCHEMA`: every label describes the REAL
   default and the REAL behaviour; `help.cmd.*` vs `SLASH_COMMANDS` (a command
   in the help without an entry, or an entry without help).
6. `src/i18n/help.ts` vs `printHelp()`: every command shown is dispatched in
   `src/index.ts`; the key bindings match the TUI.
7. `AGENTS.md`: a module map entry naming a file that was renamed or removed
   (`ls src/` is the truth), and a `DEFAULTS` value quoted in the prose.
8. `DEVELOPING.md` + `docs/DESIGN-NOTES.md`: `wc -l src/*.ts` numbers, default
   values, "two providers" phrasing, removed-flag mentions.
9. `src/i18n/*.ts`: ru/en drift — compare each pair side by side; the most
   likely drift is a number, a default, a command name or a path present in one
   language only.
