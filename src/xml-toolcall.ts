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

// Достаёт параметры из тела <invoke>. Тег открытия и закрытия может нести
// произвольный префикс (DSML и т.п.), а некоторые модели путают пары тегов
// (<parameter …> … </|DSML| parameter>). Регулярка ниже матчит любую пару
// <…parameter…> … </…parameter…>, поэтому такие «смешанные» теги тоже
// разбираются. Значения дедуплицируются: если модель повторила parameter
// несколько раз, берём ПЕРВОЕ значение, а не последнее (повторы обычно
// дублируют корректный параметр).
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

    // Некоторые модели кладут весь JSON-объект аргументов в один
    // parameter с именем args. Разворачиваем, чтобы не было
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

  // Модель иногда опускает тег <invoke> и оставляет только DSML-обёртку
  // (<|DSML| calls> … <|DSML| parameter name=…>…). Имя инструмента в таком
  // ответе отсутствует, поэтому восстановить вызов нельзя — но и молча
  // принимать его за финальный ответ нельзя: agent-loop попросит повторить
  // (looksLikeToolCall срабатывает по слову parameter/DSML).
  return null
}
