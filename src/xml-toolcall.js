function unescapeXml(s) {
  const A = String.fromCharCode(38) // ampersand
  return String(s)
    .split(A + "lt;").join(String.fromCharCode(60))
    .split(A + "gt;").join(String.fromCharCode(62))
    .split(A + "quot;").join(String.fromCharCode(34))
    .split(A + "apos;").join(String.fromCharCode(39))
    .split(A + "amp;").join(A)
}

function readAttr(attrs, name) {
  const Q = String.fromCharCode(34)
  const re = new RegExp(name + "[ ]*=[ ]*([" + Q + "]([^" + Q + "]*)[" + Q + "])")
  const m = attrs.match(re)
  return m ? m[2] : null
}

export function parseXmlToolCalls(text) {
  if (!text || typeof text !== "string") return null
  if (!/<[^>]*invoke/i.test(text)) return null

  const invokeRe = /<[^>]*?invoke([^>]*)>/gi
  const calls = []
  let m
  while ((m = invokeRe.exec(text)) !== null) {
    const attrs = m[1] || ""
    const name = readAttr(attrs, "name")
    if (!name) continue

    const rest = text.slice(invokeRe.lastIndex)
    const closeRe = /<\/[^>]*?invoke[^>]*>/i
    const closeMatch = closeRe.exec(rest)
    const body = closeMatch ? rest.slice(0, closeMatch.index) : rest

    const args = {}
    const paramRe = /<[^>]*?parameter([^>]*)>([\s\S]*?)<\/[^>]*?parameter[^>]*>/gi
    let p
    while ((p = paramRe.exec(body)) !== null) {
      const pname = readAttr(p[1] || "", "name")
      if (!pname) continue
      const isString = /string[ ]*=[ ]*"?true"?/i.test(p[1] || "")
      let value = unescapeXml(p[2])
      if (!isString) {
        try { value = JSON.parse(value) } catch (e) {}
      }
      args[pname] = value
    }

    // Некоторые модели кладут весь JSON-объект аргументов в один
    // parameter с именем args. Разворачиваем, чтобы не было
    // {args: {args: {...}}}.
    let finalArgs = args
    const keys = Object.keys(args)
    if (
      keys.length === 1 &&
      keys[0] === 'args' &&
      args.args &&
      typeof args.args === 'object' &&
      !Array.isArray(args.args)
    ) {
      finalArgs = args.args
    }

    calls.push({ tool: name, args: finalArgs })
  }

  if (!calls.length) return null
  return calls.length === 1 ? calls[0] : calls
}
