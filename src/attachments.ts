import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico']

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export interface Attachment {
  index: number
  path: string
  name: string
  mime: string
  image: boolean
  marker: string
  size: number
}

function sanitize(name: string): string {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'file'
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
  const n: number = Number(bytes) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTS.includes(path.extname(String(name || '')).toLowerCase())
}

export function parseDataUrl(text: string): { mime: string; data: Buffer } | null {
  const m = String(text || '').match(/^data:([^;,]*);base64,([\s\S]*)$/)
  if (!m) return null
  try {
    return { mime: m[1] || 'application/octet-stream', data: Buffer.from(m[2].replace(/\s+/g, ''), 'base64') }
  } catch {
    return null
  }
}

export function sniffMime(data: Buffer): string {
  if (!data || data.length < 4) return ''
  const b = data
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  return ''
}

export function parseImagePaste(raw: string): { mime: string; data: Buffer } | null {
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
    this.items = []
    this.imageCount = 0
    this.fileCount = 0
  }

  add(item: { path: string; name: string; mime: string; size: number }): Attachment {
    const image = isImageName(item.name) || String(item.mime).startsWith('image/')
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
  return /^[\w.\- ]+\.[A-Za-z0-9]{1,8}$/.test(n)
}

export async function saveToTemp(tmpDir: string, name: string, data: Buffer): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true })
  const base = sanitize(name)
  let target = path.join(tmpDir, base)
  if (await fs.stat(target).catch(() => null)) {
    const ext = path.extname(base)
    const stem = base.slice(0, base.length - ext.length)
    let i = 1
    while (await fs.stat(target).catch(() => null)) {
      target = path.join(tmpDir, stem + '-' + i + ext)
      i++
    }
  }
  await fs.writeFile(target, data)
  return target
}

export interface ClipboardResult {
  data: Buffer | null
  /** Which tool produced the image (for diagnostics), or why it failed. */
  via: string
}

// Read an image from the OS clipboard. Tries, in order, every known tool for
// the current platform. Returns the raw bytes plus a short note about which
// tool was used (or the reason nothing was found) — the caller shows that note
// to the user so a failed paste is never silent.
// True when running inside WSL. There the X11 clipboard is a SEPARATE
// clipboard from the Windows one: the user copies an image in Windows, so we
// must read it through powershell.exe, not xclip.
export function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    const rel = os.release().toLowerCase()
    if (rel.includes('microsoft') || rel.includes('wsl')) return true
  } catch {}
  return false
}

// PowerShell one-liner: write the clipboard image as raw PNG bytes to stdout.
const PS_GET_IMAGE =
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
  '$img=[System.Windows.Forms.Clipboard]::GetImage(); ' +
  'if($img){$ms=New-Object System.IO.MemoryStream; ' +
  '$img.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); ' +
  '[Console]::OpenStandardOutput().Write($ms.ToArray(),0,$ms.Length)}'

// PowerShell one-liner: write the clipboard file paths (CF_HDROP) to stdout.
const PS_GET_FILE_DROP =
  'Add-Type -AssemblyName System.Windows.Forms; ' +
  '$d=[System.Windows.Forms.Clipboard]::GetDataObject(); ' +
  'if($d -and $d.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)){' +
  '$f=$d.GetData([System.Windows.Forms.DataFormats]::FileDrop); $f -join [Environment]::NewLine}'

export function readClipboardImageDetailed(): ClipboardResult {
  if (process.platform === 'linux' || process.platform === 'freebsd' || process.platform === 'openbsd') {
    const wayland = process.env.WAYLAND_DISPLAY
    const x11 = process.env.DISPLAY
    const attempts: Array<{ bin: string; args: string[]; via: string }> = []
    // On WSL the Windows clipboard is what the user copies into — read it first.
    if (isWsl()) {
      attempts.push({ bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', PS_GET_IMAGE], via: 'powershell.exe' })
    }
    if (wayland || !x11) attempts.push({ bin: 'wl-paste', args: ['--type', 'image/png', '--no-newline'], via: 'wl-paste' })
    if (x11 || !wayland) {
      attempts.push({ bin: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-o'], via: 'xclip' })
      attempts.push({ bin: 'xsel', args: ['--clipboard', '--output'], via: 'xsel' })
    }
    // Even if the session env is missing, try the other family as a fallback.
    attempts.push({ bin: 'wl-paste', args: ['--type', 'image/png', '--no-newline'], via: 'wl-paste' })
    attempts.push({ bin: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-o'], via: 'xclip' })
    const tried: string[] = []
    for (const a of attempts) {
      if (tried.includes(a.via)) continue
      tried.push(a.via)
      const data = tryCommand(a.bin, a.args)
      if (data && sniffMime(data).startsWith('image/')) return { data, via: a.via }
      if (data && data.length) return { data, via: a.via }
    }
    return { data: null, via: 'no-tool:' + tried.join(',') }
  }
  if (process.platform === 'darwin') {
    const data = tryCommand('pngpaste', ['-'])
    return { data: data && data.length ? data : null, via: data ? 'pngpaste' : 'no-tool:pngpaste' }
  }
  if (process.platform === 'win32') {
    // PowerShell reads the clipboard image and writes raw PNG bytes to stdout.
    const ps =
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
      '$img=[System.Windows.Forms.Clipboard]::GetImage(); ' +
      'if($img){$ms=New-Object System.IO.MemoryStream; ' +
      '$img.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); ' +
      '[Console]::OpenStandardOutput().Write($ms.ToArray(),0,$ms.Length)}'
    const data = tryCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps])
    return { data: data && data.length ? data : null, via: data ? 'powershell' : 'no-tool:powershell' }
  }
  return { data: null, via: 'unsupported-platform' }
}

// Backwards-compatible wrapper used elsewhere.
export function readClipboardImage(): Buffer | null {
  return readClipboardImageDetailed().data
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

export async function findFileByName(workdir: string, name: string): Promise<string | null> {
  const candidate = path.resolve(workdir, name)
  if (await fs.stat(candidate).catch(() => null)) return candidate
  try {
    const { glob } = await import('fs/promises')
    for await (const f of glob('**/' + name, { cwd: workdir })) {
      const abs = path.resolve(workdir, f)
      const rel = path.relative(workdir, abs)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      return abs
    }
  } catch {}
  return null
}



// Read file paths from the Windows clipboard (copied files, CF_HDROP) and
// translate them to WSL paths. On WSL the user often copies a FILE, not an
// image. Returns [] on non-WSL / when nothing is there.
export function readWindowsClipboardFiles(): string[] {
 if (!isWsl()) return []
 const out = tryCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_GET_FILE_DROP])
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
 if (p.charAt(1) !== ':' || (p.charAt(2) !== '/' && p.charAt(2) !== '\\')) return null
 const drive = p.charAt(0).toLowerCase()
 const rest = p.slice(3).split('\\').join('/')
 return '/mnt/' + drive + '/' + rest
}
