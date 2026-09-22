import fs from 'fs/promises'
import path from 'path'
import { exec, type ExecOptions } from 'child_process'
import { createGitTools } from './gitTools.js'
import { createWebTools } from './web.js'
import type { ToolArgs, ToolDef } from './types.js'
import type { UndoStore } from './undo.js'

export function createTools(
  workdir: string,
  { undo }: { undo?: UndoStore | null } = {},
): ToolDef[] {
  const root = path.resolve(workdir)
  const safe = (p: string): string => {
    const resolved = path.resolve(root, p)
    // startsWith(root) пропускал бы соседние пути с общим префиксом
    // (C:\work\proj vs C:\work\proj-old). Считаем через relative().
    const rel = path.relative(root, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Доступ за пределы рабочей директории: ${p}`)
    }
    return resolved
  }

  // Sandbox (вариант A): не даём команде выйти выше root.
  // Это защитный барьер, а не полноценная изоляция ОС.
  const assertCommandInsideRoot = (command: string): void => {
    const cmd = String(command || '')
    const cdRe = /(?:^|[;&|]|\s)(?:cd|pushd)\s+([^;&|]+)/gi
    let m
    while ((m = cdRe.exec(cmd))) {
      const raw = m[1].trim()
      if (!raw || raw === '-') continue
      const target = path.resolve(root, raw)
      const rel = path.relative(root, target)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Sandbox: выход за пределы ' + root + ' запрещён (cd ' + raw + ')')
      }
    }
  }
  const runShell = (command: string, timeout = 30_000): Promise<string> =>
    new Promise((resolve) => {
      const options: ExecOptions = {
        cwd: workdir,
        timeout,
        maxBuffer: 1024 * 1024 * 8,
        windowsHide: true,
        env: { ...process.env },
      }

      if (process.platform === 'win32') {
        options.shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
      } else {
        options.shell = '/bin/sh'
      }

      exec(command, options, (err, stdout, stderr) => {
        const out = (stdout || '').toString()
        const errStr = (stderr || '').toString()

        if (!err) {
          const combined = (out + errStr).trim()
          resolve(combined || '(команда выполнена без вывода)')
          return
        }

        const parts = []

        if (err.killed) {
          parts.push(`⏱ Таймаут после ${timeout}ms — процесс убит.`)
        } else if (err.code !== undefined && err.code !== null) {
          parts.push(`Exit code: ${err.code}`)
        } else if (err.signal) {
          parts.push(`Убит сигналом: ${err.signal}`)
        } else {
          parts.push(`Ошибка: ${err.message}`)
        }

        if (out.trim()) parts.push(`stdout:\n${out.trim()}`)
        if (errStr.trim()) parts.push(`stderr:\n${errStr.trim()}`)

        resolve(parts.join('\n'))
      })
    })

  // Достаёт текст из content/content_base64. base64 нужен, потому что канал
  // передачи ответа модели может искажать символы ($, обратные слэши,
  // переводы строк). base64 состоит только из [A-Za-z0-9+/=] и искажению
  // не подвержен.
  const decodeContent = (
    content: unknown,
    contentBase64: unknown,
  ): string => {
    if (typeof contentBase64 === 'string' && contentBase64.length) {
      return Buffer.from(contentBase64, 'base64').toString('utf-8')
    }
    return String(content ?? '')
  }

  const baseTools: ToolDef[] = [
    {
      name: 'Read',
      description:
        'Прочитать содержимое файла. Опционально: offset и limit (строки).',
      parameters: { path: 'string', offset: 'number?', limit: 'number?' },
      fn: async ({ path: p, offset, limit }: ToolArgs) => {
        const file = safe(String(p))
        const content = await fs.readFile(file, 'utf-8')
        const lines = content.split('\n')
        const start = (offset as number | undefined) ?? 0
        const end = limit ? start + (limit as number) : lines.length
        return lines.slice(start, end).join('\n')
      },
    },

    {
      name: 'Write',
      description:
        'Создать или перезаписать файл. content — текст; content_base64 — тот же ' +
        'контент в base64 (используй, если текст содержит , обратные слэши, ' +
        'переводы строк или другие символы, которые могут исказиться).',
      parameters: {
        path: 'string',
        content: 'string?',
        content_base64: 'string?',
      },
      fn: async ({ path: p, content, content_base64 }: ToolArgs) => {
        const file = safe(String(p))
        const text = decodeContent(content, content_base64)
        if (undo) await undo.backup(file)
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, text, 'utf-8')
        return `Файл записан: ${p}`
      },
    },

    {
      name: 'Edit',
      description:
        'Точечная замена строки в файле. old_string должен встречаться один раз. ' +
        'old_base64/new_base64 — те же строки в base64 (если текст содержит ' +
        'спецсимволы, которые могут исказиться).',
      parameters: {
        path: 'string',
        old_string: 'string?',
        new_string: 'string?',
        old_base64: 'string?',
        new_base64: 'string?',
      },
      fn: async ({ path: p, old_string, new_string, old_base64, new_base64 }: ToolArgs) => {
        const file = safe(String(p))
        const oldStr = decodeContent(old_string, old_base64)
        const newStr = decodeContent(new_string, new_base64)
        if (oldStr === '') {
          throw new Error('old_string пустой — нечего заменять.')
        }
        let content = await fs.readFile(file, 'utf-8')
        const occurrences = content.split(oldStr).length - 1
        if (occurrences === 0) {
          throw new Error(
            `Строка не найдена в ${p}: "${oldStr.slice(0, 60)}..."`,
          )
        }
        if (occurrences > 1) {
          throw new Error(
            `Строка встречается ${occurrences} раз в ${p}. Уточните old_string.`,
          )
        }
        if (undo) await undo.backup(file)
        content = content.replace(oldStr, newStr)
        await fs.writeFile(file, content, 'utf-8')
        return `Отредактирован: ${p}`
      },
    },

    {
      name: 'Bash',
      description:
        'Выполнить shell-команду в рабочей директории (cmd.exe на Windows, sh на Linux/macOS). ' +
        'Не использовать для long-running процессов (серверы) — уйдут в таймаут. ' +
        'Не использовать для команд, требующих интерактивного ввода. ' +
        'Для git — инструменты Git*. Для интернета — WebFetch / WebSearch.',
      parameters: { command: 'string', timeout: 'number?' },
      fn: async ({ command, timeout }: ToolArgs) => {
        assertCommandInsideRoot(String(command))
        return runShell(String(command), timeout as number | undefined)
      },
    },

    {
      name: 'Glob',
      description: 'Найти файлы по glob-паттерну (например, "**/*.js").',
      parameters: { pattern: 'string' },
      fn: async ({ pattern }: ToolArgs) => {
        const { glob } = await import('fs/promises')
        const results: string[] = []
        for await (const f of glob(String(pattern), { cwd: workdir })) {
          // Sandbox: игнорируем всё, что выходит за пределы root.
          const abs = path.resolve(workdir, f)
          const rel = path.relative(root, abs)
          if (rel.startsWith('..') || path.isAbsolute(rel)) continue
          results.push(f)
        }
        return results.length ? results.join('\n') : 'Ничего не найдено.'
      },
    },

    {
      name: 'Grep',
      description: 'Поиск по содержимому файлов (регулярное выражение).',
      parameters: { pattern: 'string', path: 'string?' },
      fn: async ({ pattern, path: searchPath }: ToolArgs) => {
        const target = searchPath ? safe(String(searchPath)) : workdir
        if (process.platform === 'win32') {
          const escaped = String(pattern).replace(/"/g, '\\"')
          const scope = searchPath
            ? '"' + target + '\\*'
            : '*'
          return runShell(`findstr /s /n /r /c:"${escaped}" ` + scope)
        }
        return runShell(
          `grep -rn -E ${JSON.stringify(pattern)} ${JSON.stringify(target)} || true`,
        )
      },
    },
  ]

  const gitTools = createGitTools(workdir)
  const webTools = createWebTools()

  const respondTool: ToolDef = {
    name: 'respond',
    description: 'Дать финальный ответ пользователю и завершить задачу.',
    parameters: { message: 'string' },
    fn: async ({ message }: ToolArgs) => message,
  }

  return [...baseTools, ...gitTools, ...webTools, respondTool]
}
