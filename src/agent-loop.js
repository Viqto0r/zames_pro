import { buildSystemPrompt } from './system-prompt.js'
import { getGitContext, formatGitContext } from './git.js'

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
}) {
  if (freshChat) {
    await browser.newChat()
    transcript?.log('new_chat')
  }

  if (sendSystemPrompt) {
    let gitText = null
    try {
      const ctx = await getGitContext(workdir)
      gitText = formatGitContext(ctx)
    } catch (e) {
      gitText = `(git context error: ${e.message})`
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
  }

  let message = task
  transcript?.log('task', { task })

  for (let i = 0; i < maxIterations; i++) {
    onThinking()
    const rawResponse = await browser.ask(message)
    transcript?.log('assistant_raw', { response: rawResponse })

    const parsed = parseToolCall(rawResponse)

    if (parsed) {
      const thought = extractPreToolText(rawResponse)
      if (thought) onAssistantThought(thought)
    }

    if (!parsed) {
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
        result = `Ошибка: ${e.message}`
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

function tryParse(str) {
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

function tryParseArray(str) {
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

function parseArgsPermissive(str) {
  const result = {}
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
      return null
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

function unescapeValue(s) {
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

function parseToolCallPermissive(text) {
  const toolMatch = text.match(/"tool"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/)
  if (!toolMatch) return null
  const tool = toolMatch[1]

  const argsIdx = text.indexOf('"args"')
  if (argsIdx === -1) return null
  const openIdx = text.indexOf('{', argsIdx)
  if (openIdx === -1) return null

  for (let i = openIdx + 1; i < text.length; i++) {
    if (text[i] !== '}') continue
    const argsStr = text.slice(openIdx, i + 1)
    const args = parseArgsPermissive(argsStr)
    if (args) return { tool, args }
  }
  return null
}

function extractJsonObjects(text) {
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

function findMatching(text, openIdx, openCh, closeCh) {
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

function parseToolCall(text) {
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
  }

  const permissive = parseToolCallPermissive(cleaned)
  if (permissive) return permissive

  return null
}

function extractPreToolText(text) {
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
