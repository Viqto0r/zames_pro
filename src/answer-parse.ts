import type { ToolArgs, ToolCall, ParsedToolCall } from './types.js'
import { parseXmlToolCalls } from './xml-toolcall.js'
import { normText } from './browser-pure.js'

// Pure, state-free helpers extracted from agent-loop.ts (BACKLOG C3): the
// tool-call PARSER (JSON / permissive / XML-DSML repair) and the small answer
// heuristics. None of them touch the browser or the loop state, so this
// module is safe to import on its own. agent-loop.ts imports the ones the
// loop needs and RE-EXPORTS the public ones, so the existing API (tests import
// parseToolCall / responseLooksLikeToolCall / truncateToolResult from './agent-loop.js')
// is unchanged.
// Cap a tool result for the model, but make the truncation EXPLICIT: a bare
// slice() silently hid the tail and the model had no idea it was looking at a
// partial output (it would act on a half-read file/log).
export function truncateToolResult(text: string, limit: number): string {
  if (text.length <= limit) return text
  // Prefer a LINE boundary near the limit so the model does not read a line
  // cut in half (a half line is easy to misread as the real content). We look
  // for the last newline within the last 20% of the window; if none, fall back
  // to the hard char cut.
  let cut = limit
  const NL = String.fromCharCode(10)
  const searchFrom = Math.floor(limit * 0.8)
  const nl = text.lastIndexOf(NL, limit)
  // Cut AFTER the newline (include it) so the kept part is a whole number of
  // lines — a cut that EXCLUDED the newline left a half line before the marker.
  if (nl >= searchFrom) cut = nl + 1
  const omitted = text.length - cut
  return text.slice(0, cut) + NL + `[...truncated ${omitted} chars]`
}

// The answer looks like a tool call, but parseToolCall() did not recognize it.
// Used as a safeguard against "the agent called a tool and stopped": in that
// case runAgentLoop asks the model to resend the call instead of finishing the
// task. We catch both explicit formats and "broken" call heads
// (`<｜tool": ...`, `**tool**:`, `tool": ...`), and truncated calls.
export function responseLooksLikeToolCall(rawResponse: string): boolean {
  const raw = rawResponse || ''
  return (
    // Explicit tool-call format markers: the JSON key "tool", XML/DSML tags,
    // function_call, etc.
    /("tool"\s*:|\btool_calls?\b|\binvoke\b|\bparameter\b|DSML|function_call)/i.test(
      raw,
    ) ||
    // "tool" without an opening quote/bracket, with a junk prefix
    // (`<｜tool":`, `**tool**:`, `- tool:`): a call key, not prose.
    /(^|[^A-Za-z0-9_])(?:\*\*)?tool(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/.test(
      raw,
    ) ||
    // Keys in single quotes or unquoted: {'tool': 'Read', ...}.
    /[\{\[]\s*['"]?(tool|name|args)['"]?\s*:/.test(raw) ||
    // Truncated call: starts like a JSON object but is not closed, and has an
    // argument key (args/command/path/...). We require the opening bracket at
    // the start (after spaces/prefix) so we don't catch ordinary prose with
    // colons like "path: ...".
    (/^\s*[\[\{]/.test(raw) &&
      /["']?(?:tool|args|command|path|old_string|content|content_base64)["']?\s*:/.test(
        raw,
      )) ||
    /<\s*\|?\s*(DSML|invoke|parameter)/i.test(raw) ||
    /^\s*\[?\s*\{[^}]*$/.test(raw.trim())
  )
}

// A respond message is only a real FINAL answer when it carries some meaning.
// DeepSeek sometimes finishes with a placeholder — "...", "-", "ok", "done",
// "готово" — which looks like a stop with no report. Such a respond must not
// end the task silently: it is treated like an empty one (re-ask).
export function isMeaningfulRespond(msg: string): boolean {
  const t = (msg || '').trim()
  if (!t) return false
  // Only punctuation/dots/ellipses: "...", "---", "…", "?" — not a report.
  if (/^[.…–—_*?!/\s-]+$/.test(t)) return false
  // A bare acknowledgement with no content at all. NOTE: "ok"/"done"/
  // "готово" are NOT in this list: a short "готово" is a legitimate final
  // answer for a small task, and dropping it re-opened the loop.
  if (/^(na|null|undefined)[.!]*$/i.test(t)) return false
  return true
}

// Normalize an answer for STALE comparison: collapse whitespace AND strip
// markdown emphasis/code markers. DeepSeek echoes the previous turn with a
// different emphasis (`**done**` vs `done`), which defeated an exact match and
// made the loop re-run the same tool ("stopped after a tool call").
export function normForStale(s: string): string {
  return normText(s)
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// Text that promises a tool call in the future tense but contains no call
// itself. DeepSeek regularly "hangs" like this: it writes
// "Now update README to mention …", "Let me run the tests", "I'll check now"
// and stops. Such answers must not be taken as final — otherwise the agent
// stalls without doing the work. We keep the heuristic narrow (future tense /
// intent) so we don't catch ordinary reports of completed work.
export function looksLikeUnfinishedWork(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  // Long answers (reports) are left alone — anything can be in there.
  if (t.length > 600) return false
  // A final marker is already present — treat the answer as complete.
  if (/\b(done|finished|completed|готово|выполнено|завершено)\b/i.test(t)) {
    return false
  }
  const en =
    /\b(now|next|then|let me|let's|i will|i'll|i am going to|i'm going to|going to|about to|will now|time to)\b[^.!?\n]{0,120}\b(update|write|edit|read|run|check|add|fix|create|remove|delete|apply|test|commit|push|install|open|search|look|verify|change|modify|implement|review)\b/i
  const ru =
    /(^|[^а-яё])(проверю|обновлю|исправлю|добавлю|запущу|выполню|посмотрю|прочитаю|изменю|попробую|сделаю)([^а-яё]|$)/i
  return en.test(t) || ru.test(t)
}

// ============ JSON parsing ============

function repairRawControlChars(str: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (escape) {
      out += c
      escape = false
      continue
    }
    if (c === '\\') {
      out += c
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      out += c
      continue
    }
    if (inString) {
      if (c === '\n') {
        out += '\\n'
        continue
      }
      if (c === '\r') {
        out += '\\r'
        continue
      }
      if (c === '\t') {
        out += '\\t'
        continue
      }
      const code = c.charCodeAt(0)
      if (code < 0x20) {
        out += '\\u' + code.toString(16).padStart(4, '0')
        continue
      }
    }
    out += c
  }
  return out
}

function tryParse(str: string): ToolCall | null {
  try {
    const obj = JSON.parse(str)
    if (
      obj &&
      typeof obj.tool === 'string' &&
      obj.args &&
      typeof obj.args === 'object' &&
      !Array.isArray(obj.args)
    ) {
      return obj
    }
    return null
  } catch {
    return null
  }
}

function tryParseArray(str: string): ToolCall[] | null {
  try {
    const arr = JSON.parse(str)
    if (
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every(
        (o) =>
          o &&
          typeof o.tool === 'string' &&
          o.args &&
          typeof o.args === 'object' &&
          !Array.isArray(o.args),
      )
    ) {
      return arr
    }
    return null
  } catch {
    return null
  }
}

function parseArgsGreedy(str: string): ToolArgs | null {
  const result: ToolArgs = {}
  let i = str.indexOf('{') + 1
  if (i === 0) return null
  const skipWs = () => {
    while (i < str.length && /[\s,]/.test(str[i])) i++
  }
  while (i < str.length) {
    skipWs()
    if (i >= str.length || str[i] === '}') break
    if (str[i] !== '"') return null
    const keyEnd = str.indexOf('"', i + 1)
    if (keyEnd === -1) return null
    const key = str.slice(i + 1, keyEnd)
    i = keyEnd + 1
    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] !== ':') return null
    i++
    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] === '"') {
      let lastEnd = -1
      let k = i + 1
      while (k < str.length) {
        if (str.charCodeAt(k) === 92) {
          k += 2
          continue
        }
        if (str[k] === '"') {
          let t = k + 1
          while (t < str.length && /\s/.test(str[t])) t++
          if (t >= str.length || str[t] === ',' || str[t] === '}') lastEnd = k
        }
        k++
      }
      if (lastEnd === -1) return null
      result[key] = unescapeValue(str.slice(i + 1, lastEnd))
      i = lastEnd + 1
      continue
    }
    if (str[i] === '{' || str[i] === '[') {
      const open = str[i]
      const close = open === '{' ? '}' : ']'
      const end = findMatching(str, i, open, close)
      if (end === -1) return null
      let parsed = null
      try {
        parsed = JSON.parse(str.slice(i, end + 1))
      } catch {
        if (open === '{') parsed = parseArgsPermissive(str.slice(i, end + 1))
      }
      if (parsed === null) return null
      result[key] = parsed
      i = end + 1
      continue
    }
    let j = i
    while (j < str.length && !/[,}]/.test(str[j])) j++
    const raw = str.slice(i, j).trim()
    if (raw === 'true') result[key] = true
    else if (raw === 'false') result[key] = false
    else if (raw === 'null') result[key] = null
    else {
      const n = Number(raw)
      result[key] = Number.isNaN(n) ? raw : n
    }
    i = j
  }
  return result
}

function parseArgsPermissive(str: string): ToolArgs | null {
  const result: ToolArgs = {}
  let i = 1
  while (i < str.length) {
    while (i < str.length && /[\s,]/.test(str[i])) i++
    if (i >= str.length || str[i] === '}') break

    if (str[i] !== '"') return null
    const keyEnd = str.indexOf('"', i + 1)
    if (keyEnd === -1) return null
    const key = str.slice(i + 1, keyEnd)
    i = keyEnd + 1

    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] !== ':') return null
    i++
    while (i < str.length && /\s/.test(str[i])) i++

    if (str[i] === '"') {
      let j = i + 1
      let value = ''
      while (j < str.length) {
        const c = str[j]
        if (c === '\\' && j + 1 < str.length) {
          value += c + str[j + 1]
          j += 2
          continue
        }
        if (c === '"') {
          let k = j + 1
          while (k < str.length && /\s/.test(str[k])) k++
          if (
            k >= str.length ||
            str[k] === ',' ||
            str[k] === '}' ||
            str[k] === ']'
          ) {
            break
          }
          value += '"'
          j++
          continue
        }
        value += c
        j++
      }
      if (j >= str.length) return null
      result[key] = unescapeValue(value)
      i = j + 1
    } else if (str[i] === '{' || str[i] === '[') {
      const open = str[i]
      const close = open === '{' ? '}' : ']'
      const end = findMatching(str, i, open, close)
      if (end === -1) return null
      const frag = str.slice(i, end + 1)
      let parsedFrag = null
      try {
        parsedFrag = JSON.parse(frag)
      } catch {
        if (open === '{') parsedFrag = parseArgsPermissive(frag)
      }
      if (parsedFrag === null) return null
      result[key] = parsedFrag
      i = end + 1
    } else {
      let j = i
      while (j < str.length && !/[,}]/.test(str[j])) j++
      const raw = str.slice(i, j).trim()
      if (raw === 'true') result[key] = true
      else if (raw === 'false') result[key] = false
      else if (raw === 'null') result[key] = null
      else {
        const n = Number(raw)
        result[key] = Number.isNaN(n) ? raw : n
      }
      i = j
    }
  }
  return result
}

function unescapeValue(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n === 'n') {
        out += '\n'
        i += 2
        continue
      }
      if (n === 't') {
        out += '\t'
        i += 2
        continue
      }
      if (n === 'r') {
        out += '\r'
        i += 2
        continue
      }
      if (n === '"') {
        out += '"'
        i += 2
        continue
      }
      if (n === '\\') {
        out += '\\'
        i += 2
        continue
      }
      if (n === '/') {
        out += '/'
        i += 2
        continue
      }
      if (n === 'u' && i + 5 < s.length) {
        const hex = s.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 6
          continue
        }
      }
      out += c + n
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

function parseToolCallPermissive(
  text: string,
): { tool: string; args: ToolArgs } | null {
  const toolMatch = text.match(/"tool"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/)
  if (!toolMatch) return null
  const tool = toolMatch[1]

  // The model occasionally puts the argument keys INLINE with "tool" —
  // {"tool": "Bash", "command": "..."} — with no "args" wrapper at all.
  // The strict parser rejects it (no obj.args), and the permissive parser
  // used to bail out too (indexOf('"args"') === -1). Such a call was
  // reported as malformed and re-asked up to MAX_MALFORMED_RETRIES times;
  // after the budget ran out the run stopped with the model's text as the
  // final answer. Flatten the inline keys into args when "args" is absent.
  if (text.indexOf('"args"') === -1) {
    const braceIdx = text.indexOf('{')
    if (braceIdx === -1) return null
    const endBrace = findMatching(text, braceIdx, '{', '}')
    const objText =
      endBrace === -1
        ? text.slice(braceIdx)
        : text.slice(braceIdx, endBrace + 1)
    const inlineArgs = parseArgsPermissive(objText) || parseArgsGreedy(objText)
    if (!inlineArgs) return null
    delete inlineArgs.tool
    // The value may be a string ("command": "...") or a number/bool.
    return { tool, args: inlineArgs }
  }

  const argsIdx = text.indexOf('"args"')
  if (argsIdx === -1) return null
  const openIdx = text.indexOf('{', argsIdx)
  if (openIdx === -1) return null

  const endIdx = findMatching(text, openIdx, '{', '}')

  if (tool === 'Edit') {
    const balanced = endIdx === -1 ? null : text.slice(openIdx, endIdx + 1)
    const tailToEnd = text.slice(openIdx)
    for (const frag of [balanced, tailToEnd]) {
      if (!frag) continue
      const e = parseEditArgs(frag)
      if (e) return { tool, args: e }
    }
  }

  const frags = []
  if (endIdx !== -1) frags.push(text.slice(openIdx, endIdx + 1))
  frags.push(text.slice(openIdx))

  for (const argsStr of frags) {
    const args = parseArgsPermissive(argsStr)
    if (args) return { tool, args }
    const greedy = parseArgsGreedy(argsStr)
    if (greedy) return { tool, args: greedy }
  }
  return null
}

function parseEditArgs(str: string): ToolArgs | null {
  const keyRe = (name: string): RegExp => new RegExp('"' + name + '"\\s*:\\s*"')
  const readValue = (name: string, nextNames: string[]): string | null => {
    const m = keyRe(name).exec(str)
    if (!m) return null
    const start = m.index + m[0].length
    let end = str.length
    for (const n of nextNames) {
      const mm = keyRe(n).exec(str.slice(start))
      if (mm) {
        const absIdx = start + mm.index
        if (absIdx < end) end = absIdx
      }
    }
    let val = str.slice(start, end)
    val = val.replace(/"\s*[,}]?\s*$/, '')
    return val
  }
  const path = readValue('path', ['old_string', 'new_string'])
  const oldStr = readValue('old_string', ['new_string'])
  const newStr = readValue('new_string', [])
  if (path === null || oldStr === null || newStr === null) return null
  return { path: path, old_string: oldStr, new_string: newStr }
}

function extractJsonObjects(text: string): string[] {
  const objects = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '{') {
      const end = findMatching(text, i, '{', '}')
      if (end !== -1) {
        objects.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    if (text[i] === '[') {
      const end = findMatching(text, i, '[', ']')
      if (end !== -1) {
        objects.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    i++
  }
  return objects
}

function findMatching(
  text: string,
  openIdx: number,
  openCh: string,
  closeCh: string,
): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === openCh) depth++
    else if (c === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// The model sometimes returns a tool call with single-quoted keys/strings
// ("{'tool': 'Read', 'args': {...}}") or unquoted keys
// ("{tool: \"Read\", args: {...}}"). This is not valid JSON, and without
// normalization such an answer is silently taken as final — the agent stalls
// without calling a tool. We normalize it to double quotes.
function normalizePseudoJson(str: string): string {
  // Unquoted keys: {tool: ...} or , args: ... → "tool": / "args":
  let out = str.replace(/([\{\[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  out = out.replace(/,\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, ', "$1":')
  // Single quotes → double quotes. We don't touch the content of already
  // double-quoted strings in a row, and escape stray double quotes inside
  // single quotes.
  let res = ''
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (c === '\\' && (inDouble || inSingle)) {
      res += c
      if (i + 1 < out.length) {
        res += out[i + 1]
        i++
      }
      continue
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble
      res += c
      continue
    }
    if (c === "'" && !inDouble) {
      if (!inSingle) {
        inSingle = true
        res += '"'
      } else {
        inSingle = false
        res += '"'
      }
      continue
    }
    if (inSingle && c === '"') {
      res += '\\"'
      continue
    }
    res += c
  }
  return res
}

// The model sometimes corrupts the head of a call: `<｜tool": "Bash", "args": {...}`,
// `tool": "Read", ...`, `**tool**: ...`, `- tool: ...`. Such answers have no
// opening `{`, and the `tool` key lost its first quote. If such an answer is
// taken as final, the agent silently stalls (a frequent "stop").
// We repair it: trim the junk prefix up to the word tool, add `{` and
// balance the key quotes.
function repairToolCallPreamble(text: string): string | null {
  const t = (text || '').trim()
  const m = t.match(
    /(?:^|[^A-Za-z0-9_])(?:\*\*)?(tool)(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/,
  )
  if (!m || m.index === undefined) return null
  // We look for the start from the first quote/bracket around the key, otherwise from the word tool.
  let start = m.index
  const brace = t.indexOf('{', Math.max(0, start - 1))
  if (brace !== -1 && brace < start) start = brace
  let frag = t.slice(start)
  // If the fragment does not start with `{` — we add it.
  if (!frag.startsWith('{')) {
    // The key may have lost its opening quote: tool": → "tool".
    // We trim the leading junk up to the word tool and normalize the key quotes.
    frag = frag.replace(/^[^A-Za-z0-9_]*/, '')
    frag = frag.replace(
      /^(?:\*\*)?(["'`\u2018\u2019\u201c\u201d]*)(tool)(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/,
      '"$2":',
    )
    frag = '{' + frag
  }
  return frag
}

export function parseToolCall(text: string): ParsedToolCall {
  if (!text || typeof text !== 'string') return null

  let cleaned = text.trim()
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const candidates = extractJsonObjects(cleaned)

  // We collect EVERY recognized call, not just the first one found. The model
  // often emits several separate {"tool": ...} objects in one answer instead of
  // a single JSON array. Returning only one of them used to drop the rest and
  // could leave the agent "stalled after a tool call" with pending work.
  const collected: ToolCall[] = []
  const tryCollect = (parsed: ToolCall | ToolCall[] | null): boolean => {
    if (!parsed) return false
    if (Array.isArray(parsed)) collected.push(...parsed)
    else collected.push(parsed)
    return true
  }

  for (let i = 0; i < candidates.length; i++) {
    const raw = candidates[i]

    // A JSON array of calls is authoritative: if present, use all of it.
    const arrFirst = tryParseArray(raw)
    if (arrFirst) return arrFirst

    const arrRepaired = tryParseArray(
      raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'),
    )
    if (arrRepaired) return arrRepaired

    const first = tryParse(raw)
    if (first) {
      tryCollect(first)
      continue
    }

    const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    const second = tryParse(repaired)
    if (second) {
      tryCollect(second)
      continue
    }

    const ctrl = repairRawControlChars(raw)
    const third = tryParse(ctrl)
    if (third) {
      tryCollect(third)
      continue
    }
    const ctrlArr = tryParseArray(ctrl)
    if (ctrlArr) return ctrlArr
  }

  if (collected.length === 1) return collected[0]
  if (collected.length > 1) return collected

  // Pseudo-JSON (single quotes / unquoted keys) — normalize and try to parse
  // as a regular call before going permissive.
  if (/['"]?tool['"]?\s*:/.test(cleaned)) {
    const norm = normalizePseudoJson(cleaned)
    if (norm !== cleaned) {
      for (const raw of extractJsonObjects(norm)) {
        const a = tryParseArray(raw)
        if (a) return a
        const o = tryParse(raw)
        if (o) return o
      }
    }
  }

  const permissive =
    parseToolCallPermissive(cleaned) ||
    parseToolCallPermissive(repairRawControlChars(cleaned)) ||
    parseToolCallPermissive(normalizePseudoJson(cleaned))
  if (permissive) return { ...permissive, _permissive: true }

  const toolIdx = cleaned.search(/["']?tool["']?\s:/)
  if (toolIdx > 0) {
    let tail = cleaned.slice(toolIdx)
    tail = tail.replace(/<[^>]*>.*$/s, '').trim()
    const tailPermissive =
      parseToolCallPermissive('{"' + tail) ||
      parseToolCallPermissive('{"' + repairRawControlChars(tail))
    if (tailPermissive) return { ...tailPermissive, _permissive: true }
  }

  const xmlCalls = parseXmlToolCalls(cleaned)
  if (xmlCalls) return Array.isArray(xmlCalls) ? xmlCalls : [xmlCalls]

  // Last attempt: "fix" a corrupted call head (`<｜tool": ...`,
  // `tool": ...`, `**tool**: ...`, `- tool: ...`). We do this ONLY as a
  // fallback, after regular parsing — otherwise it's easy to corrupt valid
  // JSON (e.g. an array of calls starts with `[`, containing `{"tool":`).
  const preamble = repairToolCallPreamble(cleaned)
  if (preamble && preamble !== cleaned) {
    const reps = [
      preamble,
      repairRawControlChars(preamble),
      normalizePseudoJson(preamble),
    ]
    for (const rep of reps) {
      for (const raw of extractJsonObjects(rep)) {
        const a = tryParseArray(raw)
        if (a) return a
        const o = tryParse(raw)
        if (o) return o
      }
    }
    const perm = parseToolCallPermissive(preamble)
    if (perm) return { ...perm, _permissive: true }
  }

  return null
}

export function extractPreToolText(text: string): string {
  if (!text) return ''
  const patterns = ['{"tool"', '[{"tool"', '{"tool":', '[{"tool":']
  let earliest = -1
  for (const p of patterns) {
    const idx = text.indexOf(p)
    if (idx >= 0 && (earliest === -1 || idx < earliest)) earliest = idx
  }
  if (earliest === -1) return ''
  return text.slice(0, earliest).trim()
}
