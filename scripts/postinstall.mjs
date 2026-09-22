// Automatically install the Chromium build and system dependencies
// that Playwright needs.
//
// Runs when the zames package is installed so the user does not have to run
// "npx playwright install chromium" / "install-deps chromium" by hand.
//
// On Linux (including WSL) the browser binary also needs system libraries.
// They are installed via "install-deps", which requires root (sudo).
// If we are not root and sudo is not passwordless, we skip it and tell the
// user the exact command to run.
//
// Install failure is NOT fatal: without network access (or in CI) the
// package install must still succeed.

import { spawnSync } from 'node:child_process'

const isWin = process.platform === 'win32'

// npm puts node_modules/.bin on PATH for lifecycle scripts, so the local
// playwright CLI is resolvable. On Windows npm runs scripts through cmd.exe,
// so shell: true is needed for the .cmd shim to be found.
function run(cmd, args) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: isWin,
  })
}

function canSudo() {
  // Already root? No sudo needed.
  if (typeof process.getuid === 'function' && process.getuid() === 0) return true
  // Passwordless sudo (common in WSL / CI images).
  const r = run('sudo', ['-n', 'true'])
  return !r.error && r.status === 0
}

// 1) Browser binary for this Playwright version.
const browser = run('playwright', ['install', 'chromium'])
if (browser.error || browser.status !== 0) {
  console.warn(
    '\nzames: could not install Chromium for Playwright automatically.\n' +
      '   Run it manually: npx playwright install chromium\n',
  )
  process.exit(0)
}

// 2) System libraries (Linux / WSL only). Without them Chromium fails
// to launch with "error while loading shared libraries".
if (!isWin) {
  if (canSudo()) {
    const deps = run('playwright', ['install-deps', 'chromium'])
    if (deps.error || deps.status !== 0) {
      console.warn(
        '\nzames: could not install Chromium system dependencies automatically.\n' +
          '   Run it manually: sudo npx playwright install-deps chromium\n',
      )
    }
  } else {
    console.warn(
      '\nzames: on Linux/WSL Chromium needs system libraries (sudo required).\n' +
        '   Run it once manually: sudo npx playwright install-deps chromium\n',
    )
  }
}

// Never fail the package install because of a browser download.
process.exit(0)
