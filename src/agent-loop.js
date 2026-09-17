import { buildSystemPrompt } from './system-prompt.js'

export async function runAgentLoop({
  browser,
  tools,
  task,
  workdir,
  maxIterations = 40,
  // Если false — считаем, что системный промпт уже отправлен в этом чате
  initializeChat = true,
  onToolCall = () => {},
  onToolResult = () => {},
  onAssistantMessage = () => {},
}) {
  if (initializeChat) {
    const systemPrompt = buildSystemPrompt({ workdir, tools })
    await browser.newChat()
    await browser.ask(systemPrompt, { timeout: 60_000 })
  }

  let message = task

  for (let i = 0; i < maxIterations; i++) {
    const rawResponse = await browser.ask(message)
    const parsed = parseToolCall(rawResponse)

    if (!parsed) {
      onAssistantMessage(rawResponse)
      return rawResponse
    }

    if (parsed.tool === 'respond') {
      onAssistantMessage(parsed.args.message)
      return parsed.args.message
    }

    const tool = tools.find((t) => t.name === parsed.tool)
    if (!tool) {
      const err = `Неизвестный инструмент: ${parsed.tool}`
      onToolResult(err)
      message = JSON.stringify({ error: err })
      continue
    }

    onToolCall(parsed.tool, parsed.args)

    let result
    try {
      result = await tool.fn(parsed.args)
    } catch (e) {
      result = `Ошибка: ${e.message}`
    }

    onToolResult(result)

    const resultStr =
      typeof result === 'string' ? result : JSON.stringify(result)
    message = `Tool result for ${parsed.tool}:\n${resultStr.slice(0, 12_000)}`
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
      typeof obj.args === 'object'
    ) {
      return obj
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
    if (text[i] !== '{') {
      i++
      continue
    }
    const end = findMatchingBrace(text, i)
    if (end === -1) {
      i++
      continue
    }
    objects.push(text.slice(i, end + 1))
    i++
  }
  return objects
}

function findMatchingBrace(text, openIdx) {
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
    if (c === '{') depth++
    else if (c === '}') {
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
