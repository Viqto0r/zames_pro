import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'

export function createTools(workdir) {
  const safe = (p) => {
    const resolved = path.resolve(workdir, p)
    const root = path.resolve(workdir)
    if (!resolved.startsWith(root)) {
      throw new Error(`Доступ за пределы рабочей директории: ${p}`)
    }
    return resolved
  }

  const runShell = (command, timeout = 30_000) => {
    return new Promise((resolve) => {
      const options = {
        cwd: workdir,
        timeout,
        maxBuffer: 1024 * 1024 * 8,
        windowsHide: true,
        env: { ...process.env },
      }

      if (process.platform === 'win32') {
        // Явно запускаем cmd.exe — избегаем наследования SHELL из Git Bash,
        // иначе bash перехватывает встроенные команды cmd.
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
          parts.push(
            'Если это был сервер или long-running команда — запускайте её отдельно, а не через Bash.',
          )
        } else if (err.code !== undefined && err.code !== null) {
          parts.push(`Exit code: ${err.code}`)
        } else if (err.signal) {
          parts.push(`Убит сигналом: ${err.signal}`)
        } else {
          parts.push(`Ошибка: ${err.message}`)
        }

        if (out.trim()) parts.push(`stdout:\n${out.trim()}`)
        if (errStr.trim()) parts.push(`stderr:\n${errStr.trim()}`)
        if (parts.length === 1 && !out.trim() && !errStr.trim()) {
          parts.push(`(нет вывода) command="${command}"`)
        }

        resolve(parts.join('\n'))
      })
    })
  }

  return [
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
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, content, 'utf-8')
        return `Файл записан: ${p}`
      },
    },
    {
      name: 'Edit',
      description: 'Точечная замена строки в файле.',
      parameters: {
        path: 'string',
        old_string: 'string',
        new_string: 'string',
      },
      fn: async ({ path: p, old_string, new_string }) => {
        const file = safe(p)
        let content = await fs.readFile(file, 'utf-8')
        if (!content.includes(old_string)) {
          throw new Error(
            `Строка не найдена в ${p}: "${old_string.slice(0, 60)}..."`,
          )
        }
        content = content.replace(old_string, new_string)
        await fs.writeFile(file, content, 'utf-8')
        return `Отредактирован: ${p}`
      },
    },
    {
      name: 'Bash',
      description:
        'Выполнить shell-команду через cmd.exe в рабочей директории. ' +
        'Не использовать для long-running процессов (серверы) — они уйдут в таймаут. ' +
        'Избегайте cmd-команд с неоднозначным разрешением (timeout, curl) — у пользователя в PATH может быть Git Bash.',
      parameters: { command: 'string', timeout: 'number?' },
      fn: async ({ command, timeout }) => runShell(command, timeout),
    },
    {
      name: 'Glob',
      description: 'Найти файлы по glob-паттерну.',
      parameters: { pattern: 'string' },
      fn: async ({ pattern }) => {
        const { glob } = await import('fs/promises')
        const results = []
        for await (const f of glob(pattern, { cwd: workdir })) {
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
          return runShell(`findstr /s /n /r /c:"${escaped}" *`, undefined)
        }
        return runShell(
          `grep -rn -E ${JSON.stringify(pattern)} ${JSON.stringify(target)} || true`,
        )
      },
    },
    {
      name: 'respond',
      description: 'Дать финальный ответ пользователю и завершить задачу.',
      parameters: { message: 'string' },
      fn: async ({ message }) => message,
    },
  ]
}
