import type { ParsedToolCall, ToolArgs } from './types.js'

function unescapeXml(s: string): string {
  const A = String.fromCharCode(38) // ampersand
  return String(s)
    .split(A + 'lt;').join(String.fromCharCode(60))
    .split(A + 'gt;').join(String.fromCharCode(62))
    .split(A + 'quot;').join(String.fromCharCode(34))
    .split(A + 'apos;').join(String.fromCharCode(39))
    .split(A + 'amp;').join(A)
}

function readAttr(attrs: string, name: string): string | null {
  const Q = String.fromCharCode(34)
  const re = new RegExp(name + '[ ]*=[ ]*([' + Q + ']([^' + Q + ']*)[' + Q + '])')
  const m = attrs.match(re)
  return m ? m[2] : null
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
  const paramRe = /<[^>]*?parameter([^>]*)>([\s\S]*?)<\/[^>]*?parameter[^>]*>/gi
  let p: RegExpExecArray | null
  while ((p = paramRe.exec(body)) !== null) {
    const pname = readAttr(p[1] || '', 'name')
    if (!pname) continue
    const isString = /string[ ]*=[ ]*"?true"?/i.test(p[1] || '')
    let value: unknown = unescapeXml(p[2])
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
