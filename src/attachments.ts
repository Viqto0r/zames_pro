import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { extractPathToken } from './path-token.js'

export { extractPathToken }

const IMAGE_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.ico',
]

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export interface Attachment {
  index: number
  path: string
  name: string
  mime: string
  image: boolean
  marker: string
  size: number
  /** SHA-1 of the bytes, when known (used to de-dup identical pastes). */
  hash?: string
}

// Stable content hash for de-duplicating identical attachments (a pasted image
// is saved to a NEW temp file every time, so its path is not a stable identity).
export function contentHash(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex')
}

function sanitize(name: string): string {
  const clean = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
  if (!clean) return 'file'
  if (clean.length <= 80) return clean
  // The cap must not eat the EXTENSION: a long name became a bare stem, so the
  // temp file had no `.png` and every extension-based check (guessMime,
  // isImageName, the upload dialog) saw a plain blob instead of an image.
  const ext = path.extname(clean).slice(0, 16)
  const stem = clean.slice(0, clean.length - ext.length)
  return stem.slice(0, Math.max(1, 80 - ext.length)) + ext
}

export function guessMime(name: string): string {
  const ext = path.extname(String(name || '')).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/plain',
    '.css': 'text/css',
    '.html': 'text/html',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.csv': 'text/csv',
    '.log': 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

export function extForMime(mime: string): string {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return '.png'
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
  if (m.includes('gif')) return '.gif'
  if (m.includes('webp')) return '.webp'
  if (m.includes('svg')) return '.svg'
  if (m.includes('text/plain')) return '.txt'
  if (m.includes('json')) return '.json'
  if (m.includes('pdf')) return '.pdf'
  return ''
}

export function formatSize(bytes: number): string {
  // A non-finite count (a size derived from a broken Content-Length or a
  // failed stat) used to render as `Infinity MB`.
  const raw = Number(bytes)
  const n: number = Number.isFinite(raw) ? raw : 0
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let unit = 0
  // Promote while the ROUNDED value would read as a full next unit: 1023.999
  // KB rounds to "1024.0 KB", which should be "1.0 MB" (the same for GB/TB).
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  // Only a ROUNDED 1024.0 needs one more promotion step (1023.999 KB).
  if (value.toFixed(1) === '1024.0' && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return value.toFixed(1) + ' ' + units[unit]
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTS.includes(path.extname(String(name || '')).toLowerCase())
}

export function parseDataUrl(
  text: string,
): { mime: string; data: Buffer } | null {
  const m = String(text || '').match(/^data:([^;,]*);base64,([\s\S]*)$/)
  if (!m) return null
  try {
    const data = Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
    // An EMPTY or unparsable payload decodes to a zero-length Buffer, which is
    // still a truthy object: the paste handler then showed an `[image#N]`
    // marker for a zero-byte file and submitted a broken attachment.
    if (!data.length) return null
    return { mime: m[1] || 'application/octet-stream', data }
  } catch {
    return null
  }
}

export function sniffMime(data: Buffer): string {
  if (!data || data.length < 4) return ''
  const b = data
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46)
    return 'image/webp'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  return ''
}

export function parseImagePaste(
  raw: string,
): { mime: string; data: Buffer } | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const dataUrl = parseDataUrl(text)
  if (dataUrl) return dataUrl
  const onlyB64 = /^[A-Za-z0-9+/\s=]+$/
  if (onlyB64.test(text) && text.length >= 64) {
    try {
      const data = Buffer.from(text.replace(/\s+/g, ''), 'base64')
      const mime = sniffMime(data)
      if (mime && mime.startsWith('image/')) return { mime, data }
    } catch {
      return null
    }
  }
  return null
}

export class AttachmentStore {
  items: Attachment[] = []
  imageCount = 0
  fileCount = 0

  reset(): void {
    // Empty IN PLACE: the Ink tree captures `this.items` by reference at mount
    // (InputLine's `attachments` prop). Reassigning to a new array left the
    // tree holding the OLD one, so after the first submit every new attachment
    // was appended to an array the UI no longer read — `onSubmit` got `[]` and
    // the pasted image/file was silently dropped.
    this.items.length = 0
    this.imageCount = 0
    this.fileCount = 0
  }

  add(item: {
    path: string
    name: string
    mime: string
    size: number
    /** SHA-1 of the bytes, when known. Used to de-dup the SAME content pasted
     *  twice: image/clipboard pastes get a NEW temp path each time, so a
     *  path-only check missed them and produced [image#1] AND [image#2] for the
     *  same picture. Content is the stable identity. */
    hash?: string
  }): Attachment {
    // De-duplicate by real path (files/paths) OR by content hash (images and
    // clipboard data, which are re-saved to a fresh temp file on every paste).
    // The operator saw the SAME file become [file#1] and [file#2].
    const existing = this.items.find(
      (a) =>
        a.path === item.path || (item.hash && a.hash && a.hash === item.hash),
    )
    if (existing) return existing
    const image =
      isImageName(item.name) || String(item.mime).startsWith('image/')
    const index = image ? ++this.imageCount : ++this.fileCount
    const marker = image ? '[image#' + index + ']' : '[file#' + index + ']'
    const att: Attachment = {
      index,
      path: item.path,
      name: item.name,
      mime: item.mime,
      image,
      marker,
      size: Number(item.size) || 0,
      hash: item.hash,
    }
    this.items.push(att)
    return att
  }
}

// True if the pasted text is a single file path (e.g. '/tmp/a.png', './img.jpg',
// 'C:\\pics\\a.png' or a bare 'photo.png'). We do NOT require the file to
// exist yet — the caller checks that.
export function looksLikeFilePath(text: string): boolean {
  const s: string = String(text || '').trim()
  if (!s || s.length > 500) return false
  if (/[\r\n]/.test(s)) return false
  // A URL is not a file path. It contains `/` and ends in a short extension,
  // so it used to pass, and resolveAttachPath then resolved it RELATIVELY
  // (`https://…` -> `https:/…`): a project that happened to contain such a
  // directory silently attached the URL as a local file instead of keeping
  // the text. Any `scheme://` head is rejected here — INCLUDING one that sits
  // after prose words (`see https://x/a.png`), since the whole trimmed text is
  // handed to this check.
  if (/(?:^|\s)[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(s)) return false
  // A bare file name with an image/known extension.
  if (looksLikeFileName(s)) return true
  // A path with separators and an extension.
  if (/[\\/]/.test(s) && /\.[A-Za-z0-9]{1,8}$/.test(s)) return true
  return false
}

export function looksLikeFileName(name: string): boolean {
  const n: string = String(name || '').trim()
  if (!n) return false
  if (/[\r\n]/.test(n)) return false
  // `\w` without the `u` flag is ASCII-ONLY: a non-Latin name (`отчёт.pdf`,
  // `文件.txt`, `café.png`) was rejected, so a pasted file stayed plain text
  // instead of becoming an attachment. Split it instead: the LAST dot must be
  // followed by a short alnum extension and the stem must be non-empty and
  // free of path separators/control chars — punctuation legal in downloads
  // (`report (1).pdf`, `file+1.png`, `a&b.txt`) is allowed, prose without an
  // extension is not.
  const dot = n.lastIndexOf('.')
  if (dot <= 0 || dot >= n.length - 1) return false
  const ext = n.slice(dot + 1)
  if (!/^[A-Za-z0-9]{1,8}$/.test(ext)) return false
  const stem = n.slice(0, dot)
  if (!stem.trim()) return false
  if (/[\\/]/.test(n) || /[\u0000-\u001f\u007f]/.test(n)) return false
  return true
}

export async function saveToTemp(
  tmpDir: string,
  name: string,
  data: Buffer,
): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true })
  const base = sanitize(name)
  const ext = path.extname(base)
  const stem = base.slice(0, base.length - ext.length)
  // O_EXCL ('wx'): pick the first free name and CREATE it atomically. A
  // stat-then-write raced with another attach and silently overwrote a file.
  for (let i = 0; i < 10_000; i++) {
    const target = path.join(tmpDir, i === 0 ? base : stem + '-' + i + ext)
    try {
      await fs.writeFile(target, data, { flag: 'wx' })
      return target
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  throw new Error('could not find a free temp name for ' + base)
}

export interface ClipboardResult {
  data: Buffer | null
  /** Which tool produced the image (for diagnostics), or why it failed. */
  via: string
}

// True if any OS clipboard tool is available on this machine.
export function hasClipboardTool(): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') return true
  if (process.platform === 'linux') {
    return Boolean(
      tryCommand('xclip', ['-version']) ||
      tryCommand('xsel', ['--version']) ||
      tryCommand('wl-paste', ['--version']),
    )
  }
  return false
}

// True when the Windows filesystem is visible from here, i.e. a
// powershell.exe call can reach the Windows clipboard.
function windowsReachable(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform !== 'linux') return false
  try {
    return existsSync('/mnt/c/Windows')
  } catch {
    return false
  }
}

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  let kernelWsl = false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) kernelWsl = true
  if (!kernelWsl) {
    try {
      const rel = os.release().toLowerCase()
      if (rel.includes('microsoft') || rel.includes('wsl')) kernelWsl = true
    } catch {}
  }
  return kernelWsl && windowsReachable()
}

// PowerShell image grabber, embedded as a UTF-16LE base64 script and run
// via powershell.exe -EncodedCommand: it saves the clipboard image to a
// Windows temp .png and prints the Windows path; we read it from WSL.
const PS_IMAGE_ENCODED =
  'QQBkAGQALQBUAHkAcABlACAALQBBAHMAcwBlAG0AYgBsAHkATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVwBpAG4AZABvAHcAcwAuAEYAbwByAG0AcwAsAFMAeQBzAHQAZQBtAC4ARAByAGEAdwBpAG4AZwAKACQAaQBtAGcAPQBbAFMAeQBzAHQAZQBtAC4AVwBpAG4AZABvAHcAcwAuAEYAbwByAG0AcwAuAEMAbABpAHAAYgBvAGEAcgBkAF0AOgA6AEcAZQB0AEkAbQBhAGcAZQAoACkACgBpAGYAKAAkAGkAbQBnACkAewAkAHAAPQBKAG8AaQBuAC0AUABhAHQAaAAgACQAZQBuAHYAOgBUAEUATQBQACAAKAAiAHoAYQBtAGUAcwAtAGMAbABpAHAALQAiACsAWwBHAHUAaQBkAF0AOgA6AE4AZQB3AEcAdQBpAGQAKAApAC4AVABvAFMAdAByAGkAbgBnACgAKQArACIALgBwAG4AZwAiACkAOwAkAGkAbQBnAC4AUwBhAHYAZQAoACQAcAAsAFsAUwB5AHMAdABlAG0ALgBEAHIAYQB3AGkAbgBnAC4ASQBtAGEAZwBpAG4AZwAuAEkAbQBhAGcAZQBGAG8AcgBtAGEAdABdADoAOgBQAG4AZwApADsAVwByAGkAdABlAC0ATwB1AHQAcAB1AHQAIAAkAHAAfQAKAA=='

// PowerShell one-liner: write the clipboard file paths (CF_HDROP) to stdout.
const PS_GET_FILE_DROP =
  'Add-Type -AssemblyName System.Windows.Forms; ' +
  '$d=[System.Windows.Forms.Clipboard]::GetDataObject(); ' +
  'if($d -and $d.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)){' +
  '$f=$d.GetData([System.Windows.Forms.DataFormats]::FileDrop); $f -join [Environment]::NewLine}'

// Read an image from the OS clipboard, trying every known tool for the current
// platform. The returned `via` names the tool that worked, or why nothing was
// found — the caller shows it to the operator so a failed paste is never
// silent. On WSL the Windows clipboard comes FIRST: it is a DIFFERENT clipboard
// from X11, and the user copies the image in Windows, not in the X session.
export async function readClipboardImageDetailed(): Promise<ClipboardResult> {
  if (
    process.platform === 'linux' ||
    process.platform === 'freebsd' ||
    process.platform === 'openbsd'
  ) {
    const wayland = process.env.WAYLAND_DISPLAY
    const x11 = process.env.DISPLAY
    const attempts: Array<{ bin: string; args: string[]; via: string }> = []
    // On WSL the Windows clipboard is what the user copies into — read it first.
    if (isWsl()) {
      const win = await readWindowsClipboardImage()
      if (win) return { data: win, via: 'powershell.exe' }
    }
    if (wayland || !x11)
      attempts.push({
        bin: 'wl-paste',
        args: ['--type', 'image/png', '--no-newline'],
        via: 'wl-paste',
      })
    if (x11 || !wayland) {
      attempts.push({
        bin: 'xclip',
        args: ['-selection', 'clipboard', '-t', 'image/png', '-o'],
        via: 'xclip',
      })
      attempts.push({
        bin: 'xsel',
        args: ['--clipboard', '--output'],
        via: 'xsel',
      })
    }
    // Even if the session env is missing, try the other family as a fallback.
    attempts.push({
      bin: 'wl-paste',
      args: ['--type', 'image/png', '--no-newline'],
      via: 'wl-paste',
    })
    attempts.push({
      bin: 'xclip',
      args: ['-selection', 'clipboard', '-t', 'image/png', '-o'],
      via: 'xclip',
    })
    const tried: string[] = []
    for (const a of attempts) {
      if (tried.includes(a.via)) continue
      tried.push(a.via)
      const data = tryCommand(a.bin, a.args)
      if (data && sniffMime(data).startsWith('image/'))
        return { data, via: a.via }
      if (data && data.length) return { data, via: a.via }
    }
    return { data: null, via: 'no-tool:' + tried.join(',') }
  }
  if (process.platform === 'darwin') {
    const data = tryCommand('pngpaste', ['-'])
    return {
      data: data && data.length ? data : null,
      via: data ? 'pngpaste' : 'no-tool:pngpaste',
    }
  }
  if (process.platform === 'win32') {
    // PowerShell reads the clipboard image and writes raw PNG bytes to stdout.
    const ps =
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
      '$img=[System.Windows.Forms.Clipboard]::GetImage(); ' +
      'if($img){$ms=New-Object System.IO.MemoryStream; ' +
      '$img.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); ' +
      '[Console]::OpenStandardOutput().Write($ms.ToArray(),0,$ms.Length)}'
    const data = tryCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      ps,
    ])
    return {
      data: data && data.length ? data : null,
      via: data ? 'powershell' : 'no-tool:powershell',
    }
  }
  return { data: null, via: 'unsupported-platform' }
}

function tryCommand(bin: string, args: string[]): Buffer | null {
  try {
    const out = execFileSync(bin, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_ATTACHMENT_BYTES,
      timeout: 8000,
      windowsHide: true,
    })
    if (!out || !out.length) return null
    return out
  } catch {
    return null
  }
}

// Write text to the OS clipboard. Mirrors readClipboardImageDetailed: every
// platform has its own tool, and a failure is returned (not thrown) so the
// caller can tell the operator which tool was missing.
export function writeClipboardText(text: string): {
  ok: boolean
  via: string
} {
  const data = Buffer.from(String(text ?? ''), 'utf-8')
  const win = process.platform === 'win32'
  const mac = process.platform === 'darwin'
  const candidates: Array<{ bin: string; args: string[] }> = win
    ? [{ bin: 'clip', args: [] }]
    : mac
      ? [{ bin: 'pbcopy', args: [] }]
      : [
          { bin: 'wl-copy', args: [] },
          { bin: 'xclip', args: ['-selection', 'clipboard'] },
          { bin: 'xsel', args: ['--clipboard', '--input'] },
        ]
  for (const c of candidates) {
    try {
      execFileSync(c.bin, c.args, {
        input: data,
        stdio: ['pipe', 'ignore', 'ignore'],
        timeout: 8000,
        windowsHide: true,
      })
      return { ok: true, via: c.bin }
    } catch {
      // try the next tool
    }
  }
  return { ok: false, via: candidates.map((c) => c.bin).join('/') }
}

// Read file paths from the Windows clipboard (copied files, CF_HDROP) and
// translate them to WSL paths. On WSL the user often copies a FILE, not an
// image. Returns [] on non-WSL / when nothing is there.
export function readWindowsClipboardFiles(): string[] {
  if (!isWsl()) return []
  const out = tryCommand('powershell.exe', [
    '-STA',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    PS_GET_FILE_DROP,
  ])
  if (!out) return []
  const text = out.toString('utf-8')
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(winPathToWsl)
    .filter((p): p is string => !!p)
}

// Convert a Windows path (C:\\Users\\me\\a.png) into a WSL path
// (/mnt/c/Users/me/a.png). Leaves already-POSIX paths untouched.
export function winPathToWsl(winPath: string): string | null {
  let p = String(winPath || '').trim()
  if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
  if (!p) return null
  if (p.startsWith('/')) return p
  if (p.charAt(1) !== ':' || (p.charAt(2) !== '/' && p.charAt(2) !== '\\'))
    return null
  const drive = p.charAt(0).toLowerCase()
  const rest = p.slice(3).split('\\').join('/')
  return '/mnt/' + drive + '/' + rest
}

// Run the embedded PowerShell script and return the clipboard image bytes.
async function readWindowsClipboardImage(): Promise<Buffer | null> {
  if (!isWsl()) return null
  const out = tryCommand('powershell.exe', [
    '-STA',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    PS_IMAGE_ENCODED,
  ])
  if (!out) return null
  const first = out
    .toString('utf-8')
    .trim()
    .split(String.fromCharCode(10))[0]
    .trim()
  if (!first) return null
  const wslPath = winPathToWsl(first)
  if (!wslPath) return null
  try {
    return await fs.readFile(wslPath)
  } catch {
    return null
  }
}
