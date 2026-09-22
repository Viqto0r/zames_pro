import { spawnSync } from 'node:child_process'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

function run(cmd, args, opts = {}) {
 return spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts })
}

function has(cmd) {
 if (isWin) {
 const r = spawnSync('where', [cmd], { stdio: 'ignore' })
 return !r.error && r.status === 0
 }
 const r = spawnSync('sh', ['-c', 'command -v "$1"', 'sh', cmd], { stdio: 'ignore' })
 return !r.error && r.status === 0
}

function isRoot() {
 return typeof process.getuid === 'function' && process.getuid() === 0
}

function canSudo() {
 if (isRoot()) return true
 const r = spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' })
 return !r.error && r.status === 0
}

// package manager -> how to install a single package
const MANAGERS = [
 { bin: 'apt-get', args: (p) => ['install', '-y', p], update: ['update'] },
 { bin: 'dnf', args: (p) => ['install', '-y', p] },
 { bin: 'yum', args: (p) => ['install', '-y', p] },
 { bin: 'pacman', args: (p) => ['-S', '--noconfirm', p] },
 { bin: 'zypper', args: (p) => ['install', '-y', p] },
 { bin: 'apk', args: (p) => ['add', p] },
]

function asRoot(cmd, args) {
 if (isRoot()) return run(cmd, args)
 return run('sudo', [cmd, ...args])
}

function installPackages(pkgs) {
 const mgr = MANAGERS.find((m) => has(m.bin))
 if (!mgr) return false
 if (mgr.update) asRoot(mgr.bin, mgr.update)
 let any = false
 for (const p of pkgs) {
 const r = asRoot(mgr.bin, mgr.args(p))
 if (!r.error && r.status === 0) any = true
 }
 return any
}

// 1) Browser binary for this Playwright version.
const browser = run('playwright', ['install', 'chromium'])
if (browser.error || browser.status !== 0) {
 console.warn(
 '
zames: could not install Chromium for Playwright automatically.
' +
 ' Run it manually: npx playwright install chromium
',
 )
 process.exit(0)
}

// 2) System libraries (Linux / WSL only).
if (isLinux) {
 if (canSudo()) {
 const deps = run('playwright', ['install-deps', 'chromium'])
 if (deps.error || deps.status !== 0) {
 console.warn(
 '
zames: could not install Chromium system dependencies automatically.
' +
 ' Run it manually: sudo npx playwright install-deps chromium
',
 )
 }
 } else {
 console.warn(
 '
zames: on Linux/WSL Chromium needs system libraries (sudo required).
' +
 ' Run it once manually: sudo npx playwright install-deps chromium
',
 )
 }
}

// 3) Clipboard tool (Linux only). Windows uses PowerShell, macOS uses pngpaste
// — both are already present, nothing to install.
if (isLinux) {
 const haveXclip = has('xclip') || has('xsel')
 const haveWayland = has('wl-paste')
 if (!haveXclip || !haveWayland) {
 if (!canSudo()) {
 console.warn(
 '
zames: pasting images from the clipboard needs a clipboard tool.
' +
 ' Install one (root required), e.g.:
' +
 ' sudo apt install xclip # X11 (Debian/Ubuntu)
' +
 ' sudo apt install wl-clipboard # Wayland
' +
 ' Without it, paste a file path or use the attach button in the browser.
',
 )
 } else if (!installPackages(['xclip', 'wl-clipboard'])) {
 console.warn(
 '
zames: could not install a clipboard tool automatically.
' +
 ' Install xclip (X11) or wl-clipboard (Wayland) manually.
',
 )
 }
 }
}

// Never fail the package install because of a browser/clipboard download.
process.exit(0)
