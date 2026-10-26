# Contributing

Thanks for your interest in zames! This is a small CLI that drives a real
browser against a web chat LLM (DeepSeek, Qwen or GLM; see `/provider`). Below is how to set up, run and verify a change locally.

## Requirements

- Node.js 24 (see `.nvmrc`; `nvm use`)
- A logged-in session in the provider's profile (`~/.zames/profile` for
  DeepSeek, `~/.zames/qwen-profile` for Qwen, `~/.zames/glm-profile` for GLM)
  for the end-to-end smoke test (the unit suite does not need one)

## Setup

```bash
npm ci
npm run build
node dist/index.js --help
```

For development with auto-reload of the logic modules:

```bash
npm run dev          # tsx, headed (ZAMES_NET_DEBUG=1)
```

## Checks before committing

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (TS 6 shim)
npm run format:check # prettier
npm test             # node:test, ~40s
```

The `pre-commit` hook runs `typecheck` + `test`; `pre-push` runs
`lint` + `format:check` + `typecheck` + `build`. Tests run in CI on every
push and pull request.

## Coverage

```bash
npx tsx --test --experimental-test-coverage test/*.test.ts
```

Prints per-file line/branch coverage. Informational - the main suite stays the
pass/fail signal.

## End-to-end smoke test

`npm run self-smoke` launches a REAL isolated zames instance (throwaway
`HOME`, its own Playwright profile) and exercises login, tools and
attachments. It needs network access and valid provider credentials, so it is
NOT part of CI. Run it manually before a release:

```bash
npm run self-smoke            # headless
npm run self-smoke -- --headed
```

It never touches the operator's `~/.zames/profile`.

## Commit / release flow

- Keep commits focused; the subject line is imperative (`fix: ...`).
- Update `CHANGELOG.md` (Unreleased section) for user-visible changes.
- A release is a version bump in `package.json` (the same version is written
  into the two root fields of `package-lock.json`) plus a dated
  `CHANGELOG.md` section, tagged `vX.Y.Z`. Pushing the tag triggers the npm
  publish workflow.

## House rules (see `AGENTS.md`)

- Never kill or clean up a browser you did not start, and never point a test
  at `~/.zames/profile`.
- Agent-facing strings are English; user-facing strings go through
  `src/i18n.ts`.
