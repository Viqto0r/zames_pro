import { exec } from 'child_process'

function runGit(cmd, cwd, timeout = 15_000) {
  return new Promise((resolve) => {
    exec(
      cmd,
      {
        cwd,
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      },
      (err, stdout, stderr) => {
        const out = (stdout || '').toString()
        const errStr = (stderr || '').toString()

        if (!err) {
          const combined = (out + errStr).trim()
          resolve(combined || '(ok)')
          return
        }

        const parts = []
        if (err.killed) parts.push(`⏱ Таймаут ${timeout}ms`)
        else if (err.code !== undefined && err.code !== null)
          parts.push(`Exit code: ${err.code}`)
        else parts.push(`Ошибка: ${err.message}`)
        if (out.trim()) parts.push(out.trim())
        if (errStr.trim()) parts.push(errStr.trim())
        resolve(parts.join('\n'))
      },
    )
  })
}

// Проверяет, является ли директория git-репозиторием, и собирает контекст.
export async function getGitContext(workdir) {
  const probe = await runGit(
    'git rev-parse --is-inside-work-tree',
    workdir,
    5000,
  )
  if (probe.trim() !== 'true') return null

  const branchR = await runGit('git branch --show-current', workdir, 5000)
  const statusR = await runGit('git status --porcelain', workdir, 5000)
  const remoteR = await runGit('git remote', workdir, 5000)
  const aheadR = await runGit(
    'git rev-list --left-right --count @{upstream}...HEAD',
    workdir,
    5000,
  )

  const branch = branchR.trim() || '(detached HEAD)'
  const statusLines = statusR
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
  const remotes = remoteR
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const hasOrigin = remotes.includes('origin')

  let ahead = 0
  let behind = 0
  const m = aheadR.match(/^(\d+)\s+(\d+)/)
  if (m) {
    behind = Number(m[1])
    ahead = Number(m[2])
  }

  return {
    branch,
    changedFiles: statusLines.length,
    statusPreview: statusLines.slice(0, 30).join('\n'),
    hasOrigin,
    ahead,
    behind,
  }
}

export function formatGitContext(ctx) {
  if (!ctx) return 'Not a git repository (or git is not installed).'

  let s = `- Branch: \`${ctx.branch}\``
  if (ctx.hasOrigin) {
    s += `\n- Remote: origin (ahead ${ctx.ahead}, behind ${ctx.behind})`
  } else {
    s += '\n- Remote: (none)'
  }

  if (ctx.changedFiles > 0) {
    s += `\n- Uncommitted changes: ${ctx.changedFiles} file(s)\n`
    s += '```\n' + ctx.statusPreview + '\n```'
  } else {
    s += '\n- Working tree: clean'
  }
  return s
}

export function createGitTools(workdir) {
  return [
    {
      name: 'GitStatus',
      description:
        'Показать git status рабочей директории (кратко и полностью).',
      parameters: {},
      fn: () => runGit('git status', workdir),
    },

    {
      name: 'GitDiff',
      description:
        'Показать git diff. По умолчанию незастейдженные изменения. Можно ограничить path и указать staged=true.',
      parameters: { path: 'string?', staged: 'boolean?' },
      fn: ({ path: p, staged }) => {
        const parts = ['git diff']
        if (staged) parts.push('--staged')
        if (p) parts.push('--', JSON.stringify(p))
        return runGit(parts.join(' '), workdir, 20_000)
      },
    },

    {
      name: 'GitLog',
      description: 'Показать последние N коммитов (по умолчанию 10).',
      parameters: { count: 'number?' },
      fn: ({ count }) =>
        runGit(
          `git log --oneline --decorate -n ${Number(count) || 10}`,
          workdir,
          10_000,
        ),
    },

    {
      name: 'GitAdd',
      description:
        'Добавить файлы в индекс. Если paths не задан — git add -A (всё).',
      parameters: { paths: 'string?' },
      fn: ({ paths }) =>
        runGit(paths ? `git add ${paths}` : 'git add -A', workdir, 20_000),
    },

    {
      name: 'GitCommit',
      description:
        'Закоммитить застейдженное (если ничего не застейджено — сначала git add -A). Не пушит.',
      parameters: { message: 'string' },
      fn: async ({ message }) => {
        if (!message || !message.trim()) {
          return 'Ошибка: message пустой.'
        }
        // Не заставляем модель делать add вручную, но сообщаем, что сделали
        const addResult = await runGit('git add -A', workdir, 20_000)

        // Безопасный экранирующий вызов: пишем message во временный файл через -F
        // чтобы не бороться с кавычками в cmd.exe
        const fs = await import('fs/promises')
        const path = await import('path')
        const os = await import('os')
        const tmp = path.join(os.tmpdir(), `dsa-commit-${Date.now()}.txt`)
        await fs.writeFile(tmp, message, 'utf-8')
        try {
          const result = await runGit(
            `git commit -F ${JSON.stringify(tmp)}`,
            workdir,
            30_000,
          )
          return `add: ${addResult}\ncommit: ${result}`
        } finally {
          await fs.unlink(tmp).catch(() => {})
        }
      },
    },

    {
      name: 'GitPush',
      description:
        'Запушить ветку в origin. Требует настроенных креденшелов (SSH или Windows Credential Manager).',
      parameters: { branch: 'string?', setUpstream: 'boolean?' },
      fn: async ({ branch, setUpstream }) => {
        const b =
          branch && branch.trim()
            ? branch.trim()
            : (await runGit('git branch --show-current', workdir, 5000)).trim()
        if (!b) return 'Ошибка: не удалось определить ветку для push.'

        const flag = setUpstream ? '-u ' : ''
        return runGit(`git push ${flag}origin ${b}`, workdir, 120_000)
      },
    },
  ]
}
