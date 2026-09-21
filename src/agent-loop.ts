import { buildSystemPrompt } from './system-prompt.js'
import { getGitContext, formatGitContext } from './gitTools.js'
import { parseXmlToolCalls } from './xml-toolcall.js'
import type {
  BrowserLike,
  ParsedToolCall,
  ToolArgs,
  ToolCall,
  ToolDef,
  TranscriptLike,
} from './types.js'

export interface RunAgentLoopOptions {
  browser: BrowserLike
  tools: ToolDef[]
  task: string
  workdir: string
  maxIterations?: number
  freshChat?: boolean
  sendSystemPrompt?: boolean
  transcript?: TranscriptLike | null
  onThinking?: () => void
  onAssistantThought?: (text: string) => void
  onToolCall?: (name: string, args: ToolArgs) => void
  onToolResult?: (result: unknown) => void
  onAssistantMessage?: (msg: string) => void
  onChatReady?: (chatId: string | null) => void
  debugLog?: boolean
}

export async function runAgentLoop({
  browser,
  tools,
  task,
  workdir,
  maxIterations = 40,
  freshChat = false,
  sendSystemPrompt = false,
  transcript = null,
  onThinking = () => {},
  onAssistantThought = () => {},
  onToolCall = () => {},
  onToolResult = () => {},
  onAssistantMessage = () => {},
  onChatReady = () => {},
  debugLog = false,
}: RunAgentLoopOptions): Promise<string> {
  if (freshChat) {
    await browser.newChat()
    transcript?.log('new_chat')
  }

  // Сообщаем вызывающему актуальный chat id. После newChat() URL ещё без id
  // (он появляется только после первой отправки), поэтому зовём колбэк и
  // здесь, и после первой реальной отправки ниже.
  let lastReportedChatId: string | null = null
  const reportChat = async (): Promise<void> => {
    let id: string | null = null
    try {
      id = await browser.getCurrentChatId()
    } catch {
      id = null
    }
    if (id && id !== lastReportedChatId) {
      lastReportedChatId = id
      onChatReady(id)
    }
  }
  await reportChat()

  if (sendSystemPrompt) {
    let gitText = null
    try {
      const ctx = await getGitContext(workdir)
      gitText = formatGitContext(ctx)
    } catch (e) {
      gitText = `(git context error: ${(e as Error).message})`
    }

    const systemPrompt = buildSystemPrompt({
      workdir,
      tools,
      gitContext: gitText,
    })
    transcript?.log('system_prompt', {
      length: systemPrompt.length,
      gitContext: gitText,
    })
    onThinking()
    await browser.ask(systemPrompt, { timeout: 60_000 })
    await reportChat()
  }

  let message = task
  transcript?.log('task', { task })

  // Счётчик «ответ похож на tool-call, но не распознан». Чтобы модель,
  // написавшая битый JSON/XML, не останавливала агента молча, мы просим
  // её переотправить вызов. Ограничиваем число таких попыток.
  let malformedRetries = 0
  const MAX_MALFORMED_RETRIES = 3

  for (let i = 0; i < maxIterations; i++) {
    onThinking()
    const rawResponse = await browser.ask(message)
    await reportChat()
    transcript?.log('assistant_raw', { response: rawResponse })

    const parsed = parseToolCall(rawResponse)

    if (parsed) {
      const thought = extractPreToolText(rawResponse)
      if (thought) onAssistantThought(thought)
    }

    const parsedCalls = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    if (parsedCalls.some((p) => p && p._permissive)) {
      // Пишем в транскрипт (для отладки), но не сыпем в консоль.
      transcript?.log('permissive_parse', { response: rawResponse })
      if (debugLog) {
        console.error('внимание: tool-call распознан нестрогим парсером')
      }
    }

    if (!parsed) {
      // Ответ не распознан как tool-call. Если он ПОХОЖ на попытку вызова
      // (есть tool/invoke/parameter, но JSON/XML битый) — это почти всегда
      // ошибка формата. Не считаем её финальным ответом (иначе агент молча
      // остановится), а просим модель переотправить вызов корректно.
      const looksLikeToolCall =
        /("tool"\s*:|\btool_calls?\b|\binvoke\b|\bparameter\b|DSML|function_call)/i.test(
          rawResponse,
        ) || /\{\s*"?(tool|name)"?\s*:/.test(rawResponse)
      if (looksLikeToolCall && malformedRetries < MAX_MALFORMED_RETRIES) {
        malformedRetries++
        transcript?.log("malformed_toolcall", { attempt: malformedRetries, response: rawResponse })
        if (debugLog) {
          console.error("внимание: ответ похож на tool-call, но не распознан (попытка " + malformedRetries + "/" + MAX_MALFORMED_RETRIES + ")")
        }
        message =
          'Твой предыдущий ответ не распознан как вызов инструмента. ' +
          'Ответь РОВНО одним JSON-объектом вызова инструмента, без текста до и после. ' +
          'НЕ используй XML/DSML-теги — только JSON. ' +
          'Например: {"tool": "Read", "args": {"path": "src/index.js"}}'
        continue
      }

      onAssistantMessage(rawResponse)
      transcript?.log('assistant_final', { message: rawResponse })
      return rawResponse
    }

    const calls = Array.isArray(parsed) ? parsed : [parsed]

    const respondCall = calls.find((c) => c.tool === 'respond')
    if (respondCall) {
      const msg =
        typeof respondCall.args.message === 'string'
          ? respondCall.args.message
          : String(respondCall.args.message ?? '')
      onAssistantMessage(msg)
      transcript?.log('assistant_final', { message: msg })
      return msg
    }

    const results = []
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.tool)

      if (!tool) {
        const err = `Неизвестный инструмент: ${call.tool}`
        onToolResult(err)
        transcript?.log('tool_error', { tool: call.tool, error: err })
        results.push({ tool: call.tool, result: err })
        continue
      }

      onToolCall(call.tool, call.args)
      transcript?.log('tool_call', { tool: call.tool, args: call.args })

      let result
      try {
        result = await tool.fn(call.args)
      } catch (e) {
        result = `Ошибка: ${(e as Error).message}`
      }

      onToolResult(result)
      transcript?.log('tool_result', {
        tool: call.tool,
        result: String(result),
      })
      results.push({ tool: call.tool, result })
    }

    if (results.length === 1) {
      const r = results[0]
      const resultStr =
        typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
      message = `Tool result for ${r.tool}:\n${resultStr.slice(0, 12_000)}`
    } else {
      message = results
        .map((r) => {
          const resultStr =
            typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
          return `Tool result for ${r.tool}:\n${resultStr.slice(0, 8000)}`
        })
        .join('\n\n')
    }
  }

  return 'Достигнут лимит итераций.'
}

// ============ JSON parsing ============

function repairRawControlChars(str: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (escape) { out += c; escape = false; continue }
    if (c === '\\') { out += c; escape = true; continue }
    if (c === '"') { inString = !inString; out += c; continue }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue }
      if (c === '\r') { out += '\\r'; continue }
      if (c === '\t') { out += '\\t'; continue }
      const code = c.charCodeAt(0)
      if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue }
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

// Жадный разбор args для грязного JSON (незаэкранированные кавычки в строке).
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
        if (str.charCodeAt(k) === 92) { k += 2; continue }
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
      try { parsed = JSON.parse(str.slice(i, end + 1)) }
      catch { if (open === '{') parsed = parseArgsPermissive(str.slice(i, end + 1)) }
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
    else { const n = Number(raw); result[key] = Number.isNaN(n) ? raw : n }
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
    let keyEnd = str.indexOf('"', i + 1)
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
      // Вложенный объект/массив: находим сбалансированный фрагмент и
      // пытаемся распарсить его как JSON (или как вложенный permissive).
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

function parseToolCallPermissive(text: string): { tool: string; args: ToolArgs } | null {
  const toolMatch = text.match(/"tool"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/)
  if (!toolMatch) return null
  const tool = toolMatch[1]

  const argsIdx = text.indexOf('"args"')
  if (argsIdx === -1) return null
  const openIdx = text.indexOf('{', argsIdx)
  if (openIdx === -1) return null

  // Берём сбалансированный по скобкам фрагмент args (с учётом строк),
  // а не первый попавшийся '}'. Иначе вложенные объекты/массивы или
  // фигурные скобки внутри строк ломают разбор.
  const endIdx = findMatching(text, openIdx, '{', '}')

  if (tool === 'Edit') {
    // Edit-аргументы часто содержат сырые кавычки и переводы строк, из-за
    // чего балансировка скобок сбоит. parseEditArgs рассчитан ровно на
    // такой случай, поэтому пробуем его и на «хвосте» до конца текста,
    // а не только на сбалансированном фрагменте.
    const balanced = endIdx === -1 ? null : text.slice(openIdx, endIdx + 1)
    const tailToEnd = text.slice(openIdx)
    for (const frag of [balanced, tailToEnd]) {
      if (!frag) continue
      const e = parseEditArgs(frag)
      if (e) return { tool, args: e }
    }
  }

  // Балансировка скобок сбоит, если в строковых значениях есть сырые
  // кавычки/скобки (частый случай для Bash/Write с кодом внутри). Тогда
  // пробуем разобрать args из «хвоста» до конца текста и жадным парсером.
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

// Специализированный разбор args для Edit: ровно три поля path/old_string/
// new_string, значения могут содержать сырые кавычки и переводы строк.
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

function findMatching(text: string, openIdx: number, openCh: string, closeCh: string): number {
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

export function parseToolCall(text: string): ParsedToolCall {
  if (!text || typeof text !== 'string') return null

  let cleaned = text.trim()
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const candidates = extractJsonObjects(cleaned)

  for (let i = candidates.length - 1; i >= 0; i--) {
    const raw = candidates[i]

    const arrFirst = tryParseArray(raw)
    if (arrFirst) return arrFirst

    const arrRepaired = tryParseArray(
      raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'),
    )
    if (arrRepaired) return arrRepaired

    const first = tryParse(raw)
    if (first) return first

    const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    const second = tryParse(repaired)
    if (second) return second

    // Сырые переводы строк/табы внутри строковых значений (old_string,
    // new_string, content) делают JSON невалидным. Экранируем их и
    // пробуем снова, иначе многострочный вызов не распознаётся.
    const ctrl = repairRawControlChars(raw)
    const third = tryParse(ctrl)
    if (third) return third
    const ctrlArr = tryParseArray(ctrl)
    if (ctrlArr) return ctrlArr
  }

  const permissive =
    parseToolCallPermissive(cleaned) ||
    parseToolCallPermissive(repairRawControlChars(cleaned))
  if (permissive) return { ...permissive, _permissive: true }

  // Fallback: модель могла обернуть JSON в прозу и/или добавить мусорные
  // теги после него. Отрезаем всё до первого '"tool"' и всё, что похоже
  // на XML/DSML-хвост, затем пробуем permissive-разбор ещё раз.
  const toolIdx = cleaned.search(/["']?tool["']?\s:/)
  if (toolIdx > 0) {
    let tail = cleaned.slice(toolIdx)
    // Регексп обязан матчить многосимвольные теги (<|DSML|invoke ...>),
    // поэтому <[^>]*>, а не <[^>]> — иначе DSML-хвост не срезается,
    // permissive-разбор падает и агент молча останавливается.
    tail = tail.replace(/<[^>]*>.*$/s, '').trim()
    const tailPermissive =
      parseToolCallPermissive('{"' + tail) ||
      parseToolCallPermissive('{"' + repairRawControlChars(tail))
    if (tailPermissive) return { ...tailPermissive, _permissive: true }
  }

  // Последний fallback: модель ответила XML/DSML-блоком вместо JSON.
  const xmlCalls = parseXmlToolCalls(cleaned)
  if (xmlCalls) return Array.isArray(xmlCalls) ? xmlCalls : [xmlCalls]

  return null
}

function extractPreToolText(text: string): string {
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
