import type { ParsedToolCall, ToolArgs } from './types.js'

function unescapeXml(s: string): string {
  const A = String.fromCharCode(38) // ampersand
  return String(s)
    .split(A + 'lt;')
    .join(String.fromCharCode(60))
    .split(A + 'gt;')
    .join(String.fromCharCode(62))
    .split(A + 'quot;')
    .join(String.fromCharCode(34))
    .split(A + 'apos;')
    .join(String.fromCharCode(39))
    .split(A + 'amp;')
    .join(A)
}

function readAttr(attrs: string, name: string): string | null {
  const Q = String.fromCharCode(34)
  // A boundary BEFORE the name: without it `name` matched the TAIL of
  // `tool_name="Bash"`, so an invoke tag that restated the tool was dispatched
  // to `Bash` and the real `name="Write"` was ignored.
  const re = new RegExp(
    '(?:^|[\\s])' + name + '[ ]*=[ ]*([' + Q + ']([^' + Q + ']*)[' + Q + '])',
  )
  const m = attrs.match(re)
  return m ? m[2] : null
}

// Read EVERY key="value" pair from an <invoke ...> tag. The model sometimes
// emits a tool argument as an ATTRIBUTE of the invoke tag itself (e.g.
// `<invoke name="Write" path="chess.html">` with only the big `content` as a
// <parameter> child). readAttr() kept only the tool name, so such an argument
// was silently DROPPED and the tool failed with 'Missing required argument'.
// Keys are returned in source order so the first occurrence wins.
function readAllAttrs(attrs: string): ToolArgs {
  const Q = String.fromCharCode(34)
  const out: ToolArgs = {}
  const re = new RegExp(
    '([A-Za-z_][A-Za-z0-9_]*)[ ]*=[ ]*[' + Q + ']([^' + Q + ']*)[' + Q + ']',
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs)) !== null) {
    const key = m[1]
    if (key === 'name') continue
    if (!(key in out)) out[key] = unescapeXml(m[2])
  }
  return out
}

// The model sometimes produces a "hybrid" call: the tool name is an attribute
// AND the arguments are inline JSON in the SAME opening tag, without any
// <parameter> children. A real case from the transcript:
//   <|DSML|invoke name="GitAdd", "args" {"paths": "AGENTS.md src/index.ts"}>
// The standard <parameter> parser misses it, and the call is silently lost
// (the agent then stalls). Here we look for the first JSON object inside the
// attributes/body and parse it as args.
function parseInlineJsonArgs(s: string): ToolArgs | null {
  // Find the start of the inline JSON. The SPECIFIC `"args" {` marker wins:
  // a generic `{` in the surrounding prose (`note {here}: {…}`) was taken as
  // the object start, balance ended on its `}`, and the call reached the tool
  // with EMPTY args. Fall back to a bare `{` only when the marker is absent.
  const argsMarker = /["']args["']\s*[:=]?\s*\{/i.exec(s)
  if (argsMarker)
    return parseBalancedJson(s, argsMarker.index + argsMarker[0].length - 1)
  // No explicit marker: try EVERY `{` and take the first one that actually
  // parses as an object. Picking the first `{` blindly broke on a stray brace
  // in the prose (`note {here}: {…}`): balance ended on its `}`, the fragment
  // carried no arguments, and the tool ran with EMPTY args.
  const re = /\{/g
  let b: RegExpExecArray | null
  while ((b = re.exec(s)) !== null) {
    const parsed = parseBalancedJson(s, b.index)
    if (parsed) return parsed
  }
  return null
}

/** Parse one balanced, string-aware `{...}` object that STARTS at `from`. */
function parseBalancedJson(s: string, from: number): ToolArgs | null {
  const Q = String.fromCharCode(34)
  // Scan for a balanced {...} block (string-aware) and try to parse it.
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = true
      continue
    }
    if (c === Q) {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end === -1) return null
  let frag = s.slice(from, end).trim()
  // Drop a leading `"args" {` / `'args' {` / `args = {` prefix so only the
  // object itself is left.
  const lead = /^["']?args["']?\s*[:=]?\s*/.exec(frag)
  if (lead) frag = frag.slice(lead[0].length)
  for (const candidate of [frag, frag.replace(/'/g, Q)]) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ToolArgs
      }
    } catch {}
  }
  return null
}

// Extracts parameters from an <invoke> body. The opening and closing tags may
// carry an arbitrary prefix (DSML, etc.), and some models confuse tag pairs
// (<parameter …> … </|DSML| parameter>). The regex below matches any pair
// <…parameter…> … </…parameter…>, so such "mixed" tags are parsed too.
// Values are deduplicated: if the model repeated a parameter several times,
// we take the FIRST value, not the last (repeats usually duplicate a correct
// parameter).
function parseParameters(body: string): ToolArgs {
  const args: ToolArgs = {}
  // The VALUE is arbitrary model text: a Write/Edit content may legitimately
  // contain the literal `</parameter>` (writing an XML parser, a docs
  // example). A plain non-greedy scan stops at that FIRST close tag and the
  // rest of the content is silently lost — the file is written TRUNCATED.
  // So: find every opening tag, then take as the value everything up to the
  // LAST close tag of the same name that precedes the next opening tag (or the
  // end of the body). A stray `</parameter>` inside a value is thus kept.
  // An opening tag is `<parameter …>` / `<|DSML|parameter …>` — NOT the
  // closing `</parameter>`, whose name ALSO matches this pattern (the prefix
  // before `parameter` is not required to be empty). Treating a close tag as
  // an open one shifted every limit by one element and cut the last value;
  // a slash directly before `parameter` marks the close form.
  const openRe = /<[^>]*?(?<!\/)parameter([^>]*)>/gi
  const opens: Array<{ attrs: string; start: number; valueStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = openRe.exec(body)) !== null) {
    opens.push({
      attrs: m[1] || '',
      start: m.index,
      valueStart: m.index + m[0].length,
    })
  }
  const closeRe = /<\/[^>]*?parameter[^>]*>/gi
  for (let i = 0; i < opens.length; i++) {
    const o = opens[i]
    const pname = readAttr(o.attrs, 'name')
    if (!pname) continue
    const limit = i + 1 < opens.length ? opens[i + 1].start : body.length
    // The LAST close tag before the next opening tag (or the end).
    let valueEnd = limit
    closeRe.lastIndex = o.valueStart
    let c: RegExpExecArray | null
    while ((c = closeRe.exec(body)) !== null) {
      if (c.index >= limit) break
      valueEnd = c.index
    }
    const raw = body.slice(o.valueStart, valueEnd)
    const isString = /string[ ]*=[ ]*"?true"?/i.test(o.attrs)
    let value: unknown = unescapeXml(raw)
    if (!isString) {
      try {
        value = JSON.parse(value as string)
      } catch {}
    }
    if (!(pname in args)) args[pname] = value
  }
  return args
}

export function parseXmlToolCalls(text: string): ParsedToolCall {
  if (!text || typeof text !== 'string') return null

  const invokeRe = /<[^>]*?invoke([^>]*)>/gi
  const calls: Array<{ tool: string; args: ToolArgs }> = []
  let m: RegExpExecArray | null
  while ((m = invokeRe.exec(text)) !== null) {
    const attrs = m[1] || ''
    const name = readAttr(attrs, 'name')
    if (!name) continue

    const rest = text.slice(invokeRe.lastIndex)
    const closeRe = /<\/[^>]*?invoke[^>]*>/i
    const closeMatch = closeRe.exec(rest)
    const body = closeMatch ? rest.slice(0, closeMatch.index) : rest

    const args = parseParameters(body)
    // Arguments may ALSO arrive as attributes of the invoke tag itself
    // (`<invoke name="Write" path="chess.html">`); merge them in, letting an
    // explicit <parameter> of the same name win (it carries string=true and
    // the exact value). This is what stops `path` from being silently lost.
    const attrArgs = readAllAttrs(attrs)
    for (const k of Object.keys(attrArgs)) {
      if (!(k in args)) args[k] = attrArgs[k]
    }

    // Hybrid form: the arguments are inline JSON in the SAME invoke tag
    // (e.g. `<|DSML|invoke name="GitAdd", "args" {"paths": "..."}>`), with no
    // <parameter> children. Fall back to the raw invoke head + body.
    if (Object.keys(args).length === 0) {
      const inline = parseInlineJsonArgs(m[0] + body)
      if (inline) {
        calls.push({ tool: name, args: inline })
        continue
      }
    }

    // Some models put the whole JSON arguments object into a single
    // parameter named args. We unwrap it so there's no
    // {args: {args: {...}}}.
    let finalArgs: ToolArgs = args
    const keys = Object.keys(args)
    if (
      keys.length === 1 &&
      keys[0] === 'args' &&
      args.args &&
      typeof args.args === 'object' &&
      !Array.isArray(args.args)
    ) {
      finalArgs = args.args as ToolArgs
    }

    calls.push({ tool: name, args: finalArgs })
  }

  if (calls.length) return calls.length === 1 ? calls[0] : calls

  // The model sometimes omits the <invoke> tag and leaves only the DSML
  // wrapper (<|DSML| calls> … <|DSML| parameter name=…>…). There's no tool
  // name in such an answer, so the call can't be restored — but it also must
  // not be silently taken as the final answer: agent-loop will ask to retry
  // (looksLikeToolCall triggers on the word parameter/DSML).
  return null
}
