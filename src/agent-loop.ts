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
import { translate, type Locale } from './i18n.js'

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
  /** Warning for the operator (to the terminal, not only the transcript). */
  onWarning?: (text: string) => void
  debugLog?: boolean
  locale?: Locale
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
  onWarning = () => {},
  debugLog = false,
  locale = 'ru',
}: RunAgentLoopOptions): Promise<string> {
  if (freshChat) {
    await browser.newChat()
    transcript?.log('new_chat')
  }

  // Report the current chat id to the caller.
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
      locale,
    })
    transcript?.log('system_prompt', {
      length: systemPrompt.length,
      gitContext: gitText,
    })
    onThinking()
    // system-prompt is an agent send: throttled (agent: true).
    await browser.ask(systemPrompt, { timeout: 60_000, agent: true })
    await reportChat()
  }

  let message = task
  transcript?.log('task', { task })

  let malformedRetries = 0
  const MAX_MALFORMED_RETRIES = 3

  let stallRetries = 0
  const MAX_STALL_RETRIES = 5

  // Guard against "the agent stalled": DeepSeek sometimes sends a final text
  // that merely DESCRIBES the next tool call (or cuts the answer off
  // mid-word), and the agent silently finishes the task even though the work
  // is not done. If the final answer looks like "I'll call ... now" — we
  // re-ask instead of stopping. The counter is shared so we don't loop on a
  // chatty model.
  let looksDoneRetries = 0
  const MAX_LOOKSDONE_RETRIES = 3

  for (let i = 0; i < maxIterations; i++) {
    onThinking()
    // The first message (task) is user input: no throttle.
    // Subsequent ones (tool-result and resend requests) are agent sends:
    // throttled so we don't hit the rate limit.
    const isFirst = i === 0
    const rawResponse = await browser.ask(message, { agent: !isFirst })
    await reportChat()
    transcript?.log('assistant_raw', { response: rawResponse })

    // The user aborted generation (Esc/Ctrl+C).
    if (/^\s*\(прервано пользователем\)\s*$/.test(rawResponse)) {
      transcript?.log('user_aborted')
      return rawResponse
    }
    const parsed = parseToolCall(rawResponse)

    if (parsed) {
      const thought = extractPreToolText(rawResponse)
      if (thought) onAssistantThought(thought)
    }

    const parsedCalls = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    if (parsedCalls.some((p) => p && p._permissive)) {
      transcript?.log('permissive_parse', { response: rawResponse })
      if (debugLog) {
        console.error('внимание: tool-call распознан нестрогим парсером')
      }
    }

    if (!parsed) {
      // The answer looks like a (possibly truncated) tool call. We catch not
      // only explicit JSON but also XML/DSML forms, "dirty" variants and
      // unclosed fragments: if such an answer is silently taken as final, the
      // agent stalls even though the model tried to call a tool.
      const looksLikeToolCall = responseLooksLikeToolCall(rawResponse)
      if (looksLikeToolCall && malformedRetries < MAX_MALFORMED_RETRIES) {
        malformedRetries++
        transcript?.log('malformed_toolcall', {
          attempt: malformedRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'внимание: ответ похож на tool-call, но не распознан (попытка ' +
              malformedRetries +
              '/' +
              MAX_MALFORMED_RETRIES +
              ')',
          )
        }
        message =
          'Твой предыдущий ответ не распознан как вызов инструмента. ' +
          'Ответь РОВНО одним JSON-объектом вызова инструмента, без текста до и после. ' +
          'НЕ используй XML/DSML-теги — только JSON. ' +
          'Например: {"tool": "Read", "args": {"path": "src/index.js"}}'
        continue
      }

      const trimmed = (rawResponse || '').trim()
      // A service answer is a SHORT DeepSeek placeholder ("Reading…") or a
      // short rate-limit notice. Words about the rate limit in a LONG answer
      // are usually the agent itself quoting code/logs (the transcript had
      // exactly such a case: a 1365-char answer about ask() and limits), and
      // it must not be taken as "service", otherwise the agent re-asks in vain.
      const looksService =
        !trimmed ||
        trimmed.length < 2 ||
        /^(reading|thinking|searching|analyzing|generating|stop|остановить|читаю|думаю|поиск|анализ)[\s.…]*$/i.test(
          trimmed,
        ) ||
        (trimmed.length <= 200 &&
          /(messages? too frequent|too many requests|rate limit|слишком часто|try again later)/i.test(
            trimmed,
          ))
      if (looksService && stallRetries < MAX_STALL_RETRIES) {
        stallRetries++
        transcript?.log('stall_retry', {
          attempt: stallRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'внимание: пустой/служебный ответ, прошу продолжить (попытка ' +
              stallRetries +
              '/' +
              MAX_STALL_RETRIES +
              ')',
          )
        }
        message =
          'Продолжи выполнение задачи. Если нужен инструмент — ответь РОВНО ' +
          'одним JSON-объектом вызова: {"tool": "...", "args": {...}}. ' +
          'Если задача выполнена — вызови инструмент respond с итоговым сообщением.'
        continue
      }

      // The answer looks like "I'll call a tool now", but contains no call.
      // DeepSeek sometimes cuts the turn like this: writes "Now update
      // README…" or "Let me run the tests…" and goes silent. If this is taken
      // as final, the agent stalls without doing the work. We ask it to
      // continue and to actually call a tool this time (or respond if truly done).
      if (looksLikeUnfinishedWork(trimmed) && looksDoneRetries < MAX_LOOKSDONE_RETRIES) {
        looksDoneRetries++
        transcript?.log('unfinished_retry', {
          attempt: looksDoneRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'внимание: ответ похож на незавершённую работу, прошу продолжить (попытка ' +
              looksDoneRetries +
              '/' +
              MAX_LOOKSDONE_RETRIES +
              ')',
          )
        }
        message =
          'Похоже, ты собирался вызвать инструмент, но не вызвал. ' +
          'Если задача ещё не выполнена — ответь РОВНО одним JSON-объектом ' +
          'вызова инструмента, без текста до и после. ' +
          'Если задача действительно выполнена — вызови respond с итоговым ' +
          'сообщением оператору.'
        continue
      }

      // All re-ask attempts are exhausted, yet the answer still looks like a
      // tool call. Most likely this is a silent stall: we show the operator a
      // warning in the terminal (not only in the transcript) so they see the
      // problem immediately instead of wondering why the agent stalled.
      if (responseLooksLikeToolCall(rawResponse)) {
        transcript?.log('suspicious_final', { response: rawResponse })
        onWarning(translate(locale)('msg.suspicious_stop'))
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
      // An empty respond is not final: the model called respond but wrote no
      // summary. Finishing like this would show the operator nothing and the
      // task would "hang". We ask it to continue (within stallRetries).
      if (!msg.trim() && stallRetries < MAX_STALL_RETRIES) {
        stallRetries++
        transcript?.log('empty_respond', { attempt: stallRetries })
        if (debugLog) {
          console.error(
            'внимание: пустой respond, прошу продолжить (попытка ' +
              stallRetries +
              '/' +
              MAX_STALL_RETRIES +
              ')',
          )
        }
        message =
          'Ты вызвал respond с пустым message. Если задача выполнена — ' +
          'вызови respond с итоговым сообщением оператору. Если нет — ' +
          'продолжи работу вызовом инструмента.'
        continue
      }
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
    /^\s*[\[\{]/.test(raw) &&
      /["']?(?:tool|args|command|path|old_string|content|content_base64)["']?\s*:/.test(
        raw,
      ) ||
    /<\s*\|?\s*(DSML|invoke|parameter)/i.test(raw) ||
    /^\s*\[?\s*\{[^}]*$/.test(raw.trim())
  )
}

// Text that promises a tool call in the future tense but contains no call
// itself. DeepSeek regularly "hangs" like this: it writes
// "Now update README to mention …", "Let me run the tests", "I'll check now"
// and stops. Such answers must not be taken as final — otherwise the agent
// stalls without doing the work. We keep the heuristic narrow (future tense /
// intent) so we don't catch ordinary reports of completed work.
function looksLikeUnfinishedWork(text: string): boolean {
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
  const m = t.match(/(?:^|[^A-Za-z0-9_])(?:\*\*)?(tool)(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/)
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
