# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `WebFetch` now blocks private/loopback/link-local addresses (SSRF guard,
  including cloud metadata `169.254.169.254`) and retries transient network
  errors and 5xx responses with exponential backoff.
- CI prints per-file test coverage (`node --experimental-test-coverage`) so
  untested modules are visible in the log (informational, does not fail).

### Changed

- The `pre-push` git hook no longer runs the full test suite (it was fragile
  and timed out on tag pushes); tests stay in `pre-commit` and CI.

## [2.53.1]

### Fixed

- `require('fs')` in ESM modules (`src/attachments.ts`, `src/self-review.ts`)
  threw `ReferenceError` at runtime: WSL clipboard detection always returned
  `false` and `/self-review` found no sources when run from the built `dist/`.
- Config, session and undo index writes are now atomic (temp file + rename),
  so a crash or Ctrl+C mid-write can no longer corrupt `~/.zames/config.json`
  or a saved session.

### Changed

- Removed the unused `marked` dependency (Markdown is rendered by `markdansi`).
- CI installs dependencies with `npm ci` for reproducible builds.
- The i18n test now validates the whole `CATALOG` instead of a small sample.
- Added `.nvmrc` (Node 24).

## [2.53.0]

### Added

- Session banner warns when no saved DeepSeek session exists.
- `--no-color` flag (explicit `NO_COLOR`).

[Unreleased]: https://github.com/Viqto0r/zames_pro/compare/v2.53.1...HEAD
[2.53.1]: https://github.com/Viqto0r/zames_pro/compare/v2.53.0...v2.53.1
[2.53.0]: https://github.com/Viqto0r/zames_pro/releases/tag/v2.53.0
