// CLI color opt-out. This module MUST be imported before anything that pulls
// in chalk (see the import order in src/index.ts): chalk reads NO_COLOR at
// module-load time, so the env var has to be set first. A `--no-color` flag
// is the explicit equivalent of NO_COLOR=1 (which chalk already honors).
if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1'
}
