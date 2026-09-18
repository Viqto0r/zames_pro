import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { createGitTools } from './gitTools.js'
import { createWebTools } from './web.js'

export function createTools(workdir, { undo } = {}) {
  const root = path.resolve(workdir)
  const safe = (p) => {
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
  const assertCommandInsideRoot = (command) => {
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
  const runShell = (command, timeout = 30_000) =>
    new Promise((resolve) => {
      const options = {
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

  const baseTools = [
    {
      name: 'Read',
      description:
        'Прочитать содержимое файла. Опционально: offset и limit (строки).',
      parameters: { path: 'string', offset: 'number?', limit: 'number?' },
      fn: async ({ path: p, offset, limit }) => {
        const file = safe(p)
        const content = await fs.readFile(file, 'utf-8')
        const lines = content.split('\n')
        const start = offset ?? 0
        const end = limit ? start + limit : lines.length
        return lines.slice(start, end).join('\n')
      },
    },

    {
      name: 'Write',
      description: 'Создать или перезаписать файл.',
      parameters: { path: 'string', content: 'string' },
      fn: async ({ path: p, content }) => {
        const file = safe(p)
        if (undo) await undo.backup(file)
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, content, 'utf-8')
        return `Файл записан: ${p}`
      },
    },

    {
      name: 'Edit',
      description:
        'Точечная замена строки в файле. old_string должен встречаться один раз.',
      parameters: {
        path: 'string',
        old_string: 'string',
        new_string: 'string',
      },
      fn: async ({ path: p, old_string, new_string }) => {
        const file = safe(p)
        if (typeof old_string !== 'string' || old_string === '') {
          throw new Error('old_string пустой — нечего заменять.')
        }
        let content = await fs.readFile(file, 'utf-8')
        const occurrences = content.split(old_string).length - 1
        if (occurrences === 0) {
          throw new Error(
            `Строка не найдена в ${p}: "${old_string.slice(0, 60)}..."`,
          )
        }
        if (occurrences > 1) {
          throw new Error(
            `Строка встречается ${occurrences} раз в ${p}. Уточните old_string.`,
          )
        }
        if (undo) await undo.backup(file)
        content = content.replace(old_string, new_string)
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
      fn: async ({ command, timeout }) => {
        assertCommandInsideRoot(command)
        return runShell(command, timeout)
      },
    },

    {
      name: 'Glob',
      description: 'Найти файлы по glob-паттерну (например, "**/*.js").',
      parameters: { pattern: 'string' },
      fn: async ({ pattern }) => {
        const { glob } = await import('fs/promises')
        const results = []
        for await (const f of glob(pattern, { cwd: workdir })) {
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
      fn: async ({ pattern, path: searchPath }) => {
        const target = searchPath ? safe(searchPath) : workdir
        if (process.platform === 'win32') {
          const escaped = pattern.replace(/"/g, '\\"')
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

  const respondTool = {
    name: 'respond',
    description: 'Дать финальный ответ пользователю и завершить задачу.',
    parameters: { message: 'string' },
    fn: async ({ message }) => message,
  }

  return [...baseTools, ...gitTools, ...webTools, respondTool]
}
