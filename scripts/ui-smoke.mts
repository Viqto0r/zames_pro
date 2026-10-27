// ui-smoke: verify the TERMINAL UI (themes, input frame, status row) without
// needing a chat login.
//
// Why not self-smoke: that one drives a REAL browser + a live chat and needs
// credentials. The UI checks here are pure rendering — the palettes, the live
// `theme` object, the Ink colour map and the rendered status/prompt strings — so
// they must run fast and offline.
//
// Isolation: a throwaway HOME (like self-smoke) BEFORE importing project
// modules, so nothing here can read or write the operator's ~/.zames. The
// browser is never launched (except for the optional screenshot, which uses a
// THROWAWAY chromium profile, per AGENTS.md).
//
// Usage:  npm run ui-smoke            (text checks)
//         npm run ui-smoke -- --shots (also write docs/shots/*.png)

import fs from 'fs'
import os from 'os'
import path from 'path'

// The REAL home is captured BEFORE HOME is repointed: the Playwright browser
// cache lives under it and the screenshot step needs it.
const REAL_HOME = os.homedir()
if (!process.env.ZAMES_UI_SMOKE_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-ui-smoke-'))
  process.env.HOME = tmp
  process.env.ZAMES_UI_SMOKE_HOME = tmp
  // Playwright browsers live in the REAL cache; a throwaway HOME would hide
  // them (the screenshot step launches chromium). Symlink it read-only.
  fs.mkdirSync(path.join(tmp, '.cache'), { recursive: true })
  const realPw = path.join(REAL_HOME, '.cache', 'ms-playwright')
  if (fs.existsSync(realPw)) {
    fs.symlinkSync(realPw, path.join(tmp, '.cache', 'ms-playwright'))
  }
}

const SHOTS = process.argv.includes('--shots')
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const { PALETTES, themeNames, applyTheme, themeColors } =
  await import('../src/theme.ts')
const { syncUiColors, UI, setInputBorder, inputBorderStyle, inputBorderCols } =
  await import('../src/tui/ui-colors.ts')
const { renderMarkdown } = await import('../src/markdown.ts')
const { statusLeftText } = await import('../src/tui/StatusBar.tsx')
const { badgeTextWidth } = await import('../src/tui/StatusBar.tsx')
const { themePreviewAnsi, previewLines } =
  await import('../src/tui/theme-preview.tsx')
const { translate } = await import('../src/i18n.ts')
const { inputInnerCols, inputBoxRows } = await import('../src/input/layout.ts')

interface Result {
  name: string
  ok: boolean
  note?: string
}
const results: Result[] = []
function check(name: string, fn: () => string | void): void {
  try {
    const note = fn()
    results.push({ name, ok: true, note: note || undefined })
  } catch (e) {
    results.push({ name, ok: false, note: (e as Error).message })
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

// The SGR level is forced for the color checks: a piped stdout makes chalk emit
// plain text and every palette would look identical.
const chalkMod = await import('chalk')
const chalkLevel = chalkMod.default as unknown as { level: number }
const chalkLevelOrig = chalkLevel.level
// 1 = the 16-color palette: enough for chalk to emit SGR (the piped stdout
// makes it emit PLAIN text otherwise, and every palette would look identical).
// 3/truecolor cannot be proven here, so this is the honest level to force.
chalkLevel.level = 1

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
const answer = [
  '# Heading',
  '',
  'Body with `code` and a [link](https://example.com).',
  '',
  '```js',
  'const x = 1',
  '```',
].join(String.fromCharCode(10))

// --- 1. every palette is complete and paints the answer --------------------
check('all palettes render the answer in their own colors', () => {
  const seen = new Map<string, string>()
  for (const name of themeNames()) {
    applyTheme(name)
    const out = renderMarkdown(answer)
    assert(strip(out).includes('Body with'), `${name}: answer text lost`)
    const colors = [...out.matchAll(/\x1b\[38;2;(\d+;\d+;\d+)m/g)]
      .map((m) => m[1])
      .join(',')
    assert(colors.length > 0, `${name}: answer carried no colors`)
    assert(!seen.has(colors), `${name}: same colors as ${seen.get(colors)}`)
    seen.set(colors, name)
  }
  return `${seen.size} distinct palettes`
})

// --- 2. a theme switch repaints the SHARED objects in place --------------
check('theme + UI maps mutate in place', () => {
  applyTheme('zames')
  syncUiColors('zames')
  // Force chalk to emit SGR: a piped stdout (this script IS piped) makes chalk
  // return plain text, and then two palettes look identical. The painting
  // itself is what is under test here.
  const ch = chalkLevel
  ch.level = 1
  const before = themePreviewAnsi('zames')
  const accent = UI.accent
  applyTheme('dracula')
  syncUiColors('dracula')
  assert(themeColors().user === PALETTES.dracula.user, 'theme not repainted')
  assert(UI.accent !== accent, 'Ink UI map not repainted')
  assert(themePreviewAnsi('dracula') !== before, 'preview not repainted')
  ch.level = chalkLevelOrig
  applyTheme('zames')
  syncUiColors('zames')
})

// --- 3. the input frame setting changes geometry --------------------------
check('input frame switches wrap width and reserved rows', () => {
  setInputBorder('round')
  const framed = inputInnerCols(40, inputBorderCols())
  const framedRows = inputBoxRows('❯ ', '', 0, 40, inputBorderCols())
  setInputBorder('none')
  assert(inputBorderStyle() === undefined, 'none still draws a frame')
  const bare = inputInnerCols(40, inputBorderCols())
  const bareRows = inputBoxRows('❯ ', '', 0, 40, inputBorderCols())
  setInputBorder('round')
  assert(bare === framed + 2, `wrap width ${bare} != ${framed}+2`)
  assert(bareRows === framedRows - 2, `rows ${bareRows} != ${framedRows}-2`)
  return `wrap ${framed}->${bare}, rows ${framedRows}->${bareRows}`
})

// --- 4. the status row keeps its counters ---------------------------------
check('status row fits the pause counter next to short badges', () => {
  const t = translate('ru')
  const state = {
    pendingText: null,
    animBase: '⏳ пауза 7с перед отправкой',
    animStart: Date.now() - 5000,
    statusText: '',
    scroll: 0,
    busy: true,
    sendState: 'paused',
    locale: 'ru',
    provider: 'DeepSeek',
    queueLength: 0,
    tasks: 'задачи: 8/8',
    thinkingEnabled: false,
    searchEnabled: true,
    contextText: 'ctx: 156k · 16%',
    contextLevel: 'ok',
    statusLine: '',
  } as never
  const left = statusLeftText(state, t, 1)
  const cols = 120
  const budget = cols - 2 - badgeTextWidth(state) - 2
  assert(left.length <= budget, `left ${left.length} > budget ${budget}`)
  // The ticker digits must survive: the old third-of-width budget cut them.
  const drawn = left.slice(0, budget)
  assert(/·\s*\d+s/.test(drawn), `elapsed timer was cut: "${drawn}"`)
  return `${drawn.length} cols used of ${budget}`
})

// --- 5. /config displays the palettes with their own colors --------------
check('the config theme row lists every palette', () => {
  const names = themeNames()
  assert(names[0] === 'zames', 'zames is not the first/default palette')
  assert(names.length >= 14, `only ${names.length} palettes`)
  return names.join(', ')
})

// --- report ---------------------------------------------------------------
applyTheme('zames')
syncUiColors('zames')
let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  const mark = r.ok ? 'PASS' : 'FAIL'
  const note = r.note ? '  (' + r.note + ')' : ''
  console.log(`${mark}  ${r.name}${note}`)
}

if (SHOTS) {
  // A REAL terminal rendering of the picker + status for a visual check. The
  // colors are the palette's; the browser is a throwaway chromium.
  const { chromium } = await import('playwright')
  const outDir = path.join(root, 'docs', 'shots')
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } })
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const ansiToHtml = (s: string): string =>
    s
      .split(String.fromCharCode(10))
      .map((line) => {
        let html = ''
        const re = /\x1b\[([0-9;]*)m([^\x1b]*)/g
        let m: RegExpExecArray | null
        let last = 0
        while ((m = re.exec(line))) {
          if (m.index > last) html += esc(line.slice(last, m.index))
          const seq = m[1]
          const text = esc(m[2])
          if (seq.startsWith('38;2;')) {
            const [r, g, b] = seq.slice(5).split(';')
            html += `<span style="color:rgb(${r},${g},${b})">${text}</span>`
          } else if (seq === '1') {
            html += `<b>${text}</b>`
          } else {
            html += text
          }
          last = m.index + m[0].length
        }
        html += esc(line.slice(last))
        return html
      })
      .join('<br>')
  for (const name of ['zames', 'dracula', 'gruvbox', 'catppuccin']) {
    applyTheme(name)
    syncUiColors(name)
    // The shot needs SGR in the stream; level 1 (the forced one) is enough for
    // ansiToHtml to rebuild rgb() spans from the 256-color/16-color codes? No:
    // only truecolor can be mapped back exactly, so the palettes' colors are
    // taken from PALETTES in ansiToHtml's caller below (see themeShotHtml).
    chalkLevel.level = 1
    // The shot must carry the REAL palette colors. chalk degrades #rrggbb to
    // a 16/256-color approximation at level 1, and a piped stdout forces
    // level 0 (plain) — so the preview is built here from PALETTES directly,
    // one span per role, with no chalk in the way.
    const palette = (
      PALETTES as unknown as Record<string, Record<string, string>>
    )[name]
    const body = previewLines()
      .map((l) => {
        const color = palette[l.role]
        const style = l.bold ? ';font-weight:700' : ''
        return `<span style="color:${color}${style}">${esc(l.text)}</span>`
      })
      .join('<br>')
    await page.setContent(
      `<html><body style="background:${palette.bg};color:#ccc;font:14px 'DejaVu Sans Mono',monospace;padding:16px">` +
        `<h3 style="color:#fff">/theme → ${name}</h3>${body}</body></html>`,
    )
    await page.screenshot({ path: path.join(outDir, `theme-${name}.png`) })
  }
  chalkLevel.level = chalkLevelOrig
  await browser.close()
  applyTheme('zames')
  syncUiColors('zames')
  console.log(`screenshots: ${outDir}`)
}

process.exit(failed ? 1 : 0)
