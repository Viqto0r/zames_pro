# Bug hunt — protocol for an unattended `/loop` run

Goal: walk the SOURCE of zames_pro one module per step, find a real, reproducible
defect, write a FAILING test first, fix it, run the gates, commit and PUSH to
`master` (`git push origin master`); do NOT bump the version.

This is the CODE counterpart of `docs/TEXT-AUDIT.md`. The text audit covered the
prose; this protocol covers behaviour. Keep your journal in `QUEUE.md` (it is
gitignored) and keep its "Covered areas" list up to date so the next step does
not repeat work.

## 1. Scope — the code that can actually break

Source of truth is `src/`. Generated things (`dist/`, `README.md`, root
`llms.txt`, `docs/changelog*.md`, `docs/_data/site_ui.yml`) are NEVER edited by
hand.

| Kind              | Files                                                                                                                                                                                                   | Notes                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Provider browsers | `src/browser*.ts`, `src/qwen-*.ts`, `src/glm-*.ts`, `src/deepseek-ui.ts`, `src/*-net-capture.ts`                                                                                                        | Most fragile: live DOM/SSE, a redesign breaks them silently |
| Core loop         | `src/agent-loop.ts`, `src/answer-parse.ts`, `src/xml-toolcall.ts`, `src/ask-*.ts`, `src/retry-*.ts`, `src/send-*.ts`                                                                                    | The "agent stopped" family; see DESIGN-NOTES                |
| Tools             | `src/tools.ts`, `src/extraTools.ts`, `src/gitTools.ts`, `src/web.ts`, `src/shell.ts`, `src/sandbox.ts`, `src/permissions.ts`                                                                            | Every required arg goes through `req()`                     |
| Config / schema   | `src/config*.ts`, `src/cli-args.ts`, `src/prompt-budget.ts`                                                                                                                                             | `CONFIG_SCHEMA` vs `DEFAULTS` drift                         |
| Commands          | `src/*-command*.ts`, `src/commands.ts`, `src/scheduler*.ts`, `src/goal.ts`, `src/compact.ts`                                                                                                            | Pure halves are unit-testable                               |
| Context / prompt  | `src/context.ts`, `src/system-prompt.ts`, `src/path-token.ts`, `src/attach-*.ts`, `src/subagent.ts`                                                                                                     |                                                             |
| Persistence       | `src/sessions.ts`, `src/transcript.ts`, `src/undo.ts`, `src/checkpoint.ts`, `src/restore-history.ts`                                                                                                    | Data loss = P0                                              |
| UI / TUI          | `src/input.ts`, `src/input/*`, `src/tui/*` (pure halves first: `edit.ts`, `keys.ts`, `layout.ts`, `log-window.ts`, `login-pure.ts`), `src/spinner.ts`, `src/markdown.ts`, `src/width.ts`, `src/diff.ts` | A `*.tsx` is driven through its pure half or a pty probe    |
| i18n              | `src/i18n/*.ts` (behaviour: a key used with the wrong params, a missing key, ru/en drift that changes MEANING)                                                                                          | Wording belongs to TEXT-AUDIT                               |
| Scripts / CI      | `scripts/*.mts`, `.husky/pre-push`, `.github/workflows/*`                                                                                                                                               |                                                             |

OUT of scope: `CHANGELOG.md` history, `docs/` prose (TEXT-AUDIT owns it),
`BACKLOG.md`, `QUEUE.md`, `dist/`, `node_modules/`, the demo assets.

## 2. One step = ONE defect in ONE module (or one tightly related pair)

At the START of every step:

1. `git status --short` — must be clean. Dirty tree: finish or revert first.
2. Read `QUEUE.md`: the "Covered areas" list and the last few steps. Pick the
   next module that is NOT covered — or a module whose recent commits changed
   it (a covered module is re-opened when its code changed after the covering
   date).
3. Pick by RISK, not by habit: a module touched since it was last covered, a
   module with no test file, a `catch {}` that swallows, a place DESIGN-NOTES
   warns about.

## 3. What counts as a bug (prove it, do not invent)

A defect must be REPRODUCIBLE: you can state the input/state, the expected
behaviour and the actual one, and you can turn that into a failing test.

1. **Wrong result** — a pure function returns the wrong value for an input it
   claims to handle (off-by-one, a boundary, `NaN`, `Infinity`, `-0`, an empty
   string, a negative/zero number).
2. **Throw where the contract is best-effort** — a `create`/`restore`/`save`
   that is documented as best-effort throws on a spawn/parse error instead of
   returning `null`/a machine reason.
3. **Swallowed error** — `catch {}` hides a real failure the operator must see
   (a broken config, a failed backup, a lost session).
4. **Unbounded growth** — a file/list/string that grows without a cap where
   the code already caps everything else (a session file, a transcript entry,
   a log dir).
5. **Lost data** — a write that truncates what it cannot re-read, a restore
   that drops turns, a rewind that deletes before backing up.
6. **Race / ordering** — a promise not awaited, a state read before it is set,
   a timer that fires after the owner was replaced.
7. **Stale reference** — code that calls a function that was renamed/removed, a
   provider that still assumes two backends, a flag parsed but never used, a
   config key read but absent from `CONFIG_SCHEMA`.
8. **Platform bug** — path handling that breaks on Windows (`\\`, drive
   letters), a shell call that assumes `sh`, a TTY assumption outside TTY.
9. **Guard that does not guard** — a validator that accepts the exact input it
   was written to reject; `test/undefined-guard.test.ts` exists because of one.

NOT a bug: style, a shorter implementation, a comment, a hypothetical input the
function never receives, a behaviour the docs promise (that is a TEXT-AUDIT
finding — fix the doc there, or fix BOTH here if the code is really wrong).
When you cannot turn it into a test, it is not proven yet — keep looking or
note it in the journal as `подозрение` and move on.

## 4. Fix rules

- **TDD**: write the failing test FIRST (`test/<module>-<bug>.test.ts`), run it,
  see it FAIL for the right reason, then fix. A test written after the fix
  proves nothing.
- Fix the ROOT CAUSE in the owning module (see the module map in `AGENTS.md`);
  do not patch the caller.
- Keep the diff MINIMAL: one defect family per commit. No drive-by refactors,
  no reformatting, no renames.
- Keep the "why" comments: a new comment explains WHY, not WHAT (see AGENTS.md).
- If the bug is a missing guard that a sibling module already has, mirror the
  sibling's shape instead of inventing a third pattern.
- Never touch a running browser or another agent's processes (AGENTS.md HARD
  RULE). A test that needs a browser launches its OWN profile.

## 5. Verify before reporting (mandatory)

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

A step whose gates are red is NOT done: fix it or revert the step. If you
changed `agent-loop.ts`, `browser*.ts` or the parser, also run the focused
suites (`npx tsx --test test/answer-parse*.test.ts test/agent-loop*.test.ts`).
When the change is provider-visible, run the matching smoke: `npm run
self-smoke` / `npm run qwen-smoke` / `npm run glm-smoke` (GLM needs `--headed`).

## 6. Journal + commit

- Append to `QUEUE.md` under `### Такт N (YYYY-MM-DD) — исправлено|чисто`:
  цель (module), the bug (file:line, the wrong behaviour, HOW you proved it),
  the fix, the test, the gates, the commit SHA.
- Add the module to "Покрытые области" with the date and the one-line finding.
- Commit with a conventional subject: `fix(scope): ...`, `test(scope): ...`
  (`test:` when the step found only a missing test). One commit per step.
- Then PUSH: `git push origin master`. If rejected (pre-push hooks or a
  non-fast-forward), fix and push again — NEVER force-push.
- Do NOT run `npm run release`, do NOT touch `package.json` `version`.

## 7. Keeping QUEUE.md usable (it is a QUEUE, not an archive)

`QUEUE.md` is gitignored and once grew to 9400 lines of finished steps. Keep
only the "Покрытые области" list plus the last ~15 steps; delete older ones
(the commits and `CHANGELOG.md` are the real history). When it passes ~2000
lines, replace it with a fresh skeleton before continuing.

## 8. The `/loop` command to start it

Run this ONCE in the project directory (a step with a full `npm test` takes
minutes, so do not go below `15m`):

```
/loop 20m Bug hunt, one step. Read docs/BUGHUNT.md and follow it exactly: pick the next NOT-yet-covered module from its scope table (skip the ones under "Покрытые области" in QUEUE.md unless their code changed after the covering date), find ONE real reproducible defect, write the FAILING test first (RED), fix the root cause (GREEN), run the gates (typecheck, test, lint, format:check, build), append a `### Такт N` entry to QUEUE.md with the proof + test + gates + commit SHA, update "Покрытые области", commit (fix:/test: subject) and push to master (git push origin master). Do NOT bump the version. If the module is clean, add it to "Покрытые области", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every module in the scope table is covered and no covered module has changed since its covering date.
```

One-liner variant if the task text must fit on one line:

```
/loop 20m Bug hunt step: read docs/BUGHUNT.md and follow it exactly (next uncovered module, one reproducible defect, failing test first, root-cause fix, run gates, journal in QUEUE.md, update Покрытые области, commit and push to master, no version bump).
```

## 9. Suggested first passes (highest value)

The code has moved a lot since the last hunt (the last recorded step is №353,
and the provider/loop/retry area was rewritten many times since):

1. **The new modules with no hunt history**: `src/retry-backoff.ts`,
   `src/retry-policy.ts`, `src/send-slot.ts`, `src/ask-state.ts`,
   `src/ask-retry.ts`, `src/browser-base.ts`, `src/provider-errors.ts`,
   `src/restore-history.ts`, `src/config-schema.ts`, `src/changelog.ts`,
   `src/completion-check.ts`, `src/prompt-budget.ts`, `src/swallow.ts`.
2. **The provider rewrite**: `browser.ts` now sits on `browser-base.ts`; the
   Qwen/GLM facades changed with it. Check the capability flags
   (`src/providers.ts`) against what each facade actually implements.
3. **The shared restore layer** (`src/restore-history.ts`): one normalizer for
   three providers — a DeepSeek-shaped assumption now leaks into Qwen/GLM.
4. **The `*-command.ts` split** (`info-`, `queue-`, `status-`, `session-`,
   `model-`, `provider-`, `resume-`, `tree-`, `limits-`, `scheduler-`): pure
   routing added recently; a subcommand that falls through to the wrong
   branch is a cheap, high-value find.
5. **The config schema split** (`config-schema.ts` vs `DEFAULTS` vs
   `src/i18n/config.ts`): a key in one and not the others.
6. **The TUI pure halves** (`src/tui/edit.ts`, `keys.ts`, `layout.ts`,
   `log-window.ts`, `login-pure.ts`): boundary inputs (`NaN` width, an empty
   buffer, a zero-height window).
7. **Boundary arithmetic everywhere**: `Infinity`/`NaN`/`-0`/`MAX_SAFE_INTEGER`
   in the telemetry, throttle, backoff and retention code — the last hunt
   found two real overflow bugs there.
