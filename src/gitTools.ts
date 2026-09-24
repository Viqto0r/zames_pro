import { exec } from 'child_process'
import type { GitContext, ToolDef } from './types.js'

const BS = String.fromCharCode(92)

export function runGit(
  cmd: string,
  cwd: string,
  timeout = 15_000,
): Promise<string> {
  return new Promise((resolve) => {
    exec(
      cmd,
      {
        cwd,
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_PAGER: 'cat',
          PAGER: 'cat',
        },
      },
      (err, stdout, stderr) => {
        const out = (stdout || '').toString()
        const errStr = (stderr || '').toString()

        if (!err) {
          const combined = (out + errStr).trim()
          resolve(combined || '(command produced no output)')
          return
        }

        const parts: string[] = []
        if (err.killed) parts.push(`⏱ Timeout ${timeout}ms`)
        else if (err.code !== undefined && err.code !== null)
          parts.push(`Exit code: ${err.code}`)
        else parts.push(`Error: ${err.message}`)
        if (out.trim()) parts.push(out.trim())
        if (errStr.trim()) parts.push(errStr.trim())
        resolve(parts.join(String.fromCharCode(10)))
      },
    )
  })
}

// Safely quotes paths/arguments for passing to the shell.
// String or array -> a string with double quotes and escaping.
function quoteArgs(input: string | string[]): string {
  const list = Array.isArray(input) ? input : [input]
  return list
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((v) => JSON.stringify(v))
    .join(' ')
}

// Checks whether the directory is a git repository and gathers the context.
export async function getGitContext(workdir: string): Promise<GitContext | null> {
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
    .split(String.fromCharCode(10))
    .map((l) => l.trimEnd())
    .filter(Boolean)
  const remotes = remoteR
    .split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter(Boolean)
  const hasOrigin = remotes.includes('origin')

  let ahead = 0
  let behind = 0
  const m = aheadR.match(new RegExp('^(' + BS + 'd+)' + BS + 's+(' + BS + 'd+)'))
  if (m) {
    behind = Number(m[1])
    ahead = Number(m[2])
  }

  return {
    branch,
    changedFiles: statusLines.length,
    statusPreview: statusLines.slice(0, 30).join(String.fromCharCode(10)),
    hasOrigin,
    ahead,
    behind,
  }
}

export function formatGitContext(ctx: GitContext | null): string {
  if (!ctx) return 'Not a git repository (or git is not installed).'

  let s = `- Branch: \`${ctx.branch}\``
  if (ctx.hasOrigin) {
    s += `\n- Remote: origin (ahead ${ctx.ahead}, behind ${ctx.behind})`
  } else {
    s += '\n- Remote: (none)'
  }

  if (ctx.changedFiles > 0) {
    s += `\n- Uncommitted changes: ${ctx.changedFiles} file(s)
`
    s += '```\n' + ctx.statusPreview + '\n```'
  } else {
    s += '\n- Working tree: clean'
  }
  return s
}

export function createGitTools(workdir: string): ToolDef[] {
  const ensureRepo = async (): Promise<string | null> => {
    const probe = await runGit(
      'git rev-parse --is-inside-work-tree',
      workdir,
      5000,
    )
    if (probe.trim() !== 'true') {
      return (
        `Not a git repository: ${workdir}\n` +
        `Hint: run \`git init\` here, or cd into an existing repo.\n` +
        `(raw probe output: ${JSON.stringify(probe.trim())})`
      )
    }
    return null
  }

  return [
    {
      name: 'GitStatus',
      description:
        'Show the git status of the working directory. Returns an error if this is not a git repository.',
      parameters: {},
      fn: async () => {
        const err = await ensureRepo()
        if (err) return err
        return runGit('git status', workdir, 10_000)
      },
    },

    {
      name: 'GitDiff',
      description:
        'Show git diff. By default unstaged changes. Can be limited with path and staged=true.',
      parameters: { path: 'string?', staged: 'boolean?' },
      fn: async ({ path: p, staged }) => {
        const err = await ensureRepo()
        if (err) return err
        const parts = ['git diff']
        if (staged) parts.push('--staged')
        if (p) parts.push('--', JSON.stringify(p))
        return runGit(parts.join(' '), workdir, 20_000)
      },
    },

    {
      name: 'GitLog',
      description: 'Show the last N commits (default 10).',
      parameters: { count: 'number?' },
      fn: async ({ count }) => {
        const err = await ensureRepo()
        if (err) return err
        return runGit(
          `git log --oneline --decorate -n ${Number(count) || 10}`,
          workdir,
          10_000,
        )
      },
    },

    {
      name: 'GitAdd',
      description:
        'Stage files. If paths is not given — git add -A (everything).',
      parameters: { paths: 'string?' },
      fn: async ({ paths }) => {
        const err = await ensureRepo()
        if (err) return err
        return runGit(
          paths && String(paths).trim()
            ? 'git add -- ' + quoteArgs(paths as string | string[])
            : 'git add -A',
          workdir,
          20_000,
        )
      },
    },

    {
      name: 'GitCommit',
      description:
        'Commit staged changes (if nothing is staged — git add -A first). Does not push.',
      parameters: { message: 'string' },
      fn: async ({ message }) => {
        const err = await ensureRepo()
        if (err) return err

        const msg = String(message || '')
        if (!msg.trim()) {
          return 'Error: message is empty.'
        }

        // We stage everything only if the index is empty (as the description promises).
        const staged = await runGit(
          'git diff --cached --name-only',
          workdir,
          10_000,
        )
        const hasStaged =
          !/^\s*/.test(staged) &&
          staged.trim() !== '(command produced no output)'
        const addResult = hasStaged
          ? '(index is not empty — add -A skipped)'
          : await runGit('git add -A', workdir, 20_000)

        const fs = await import('fs/promises')
        const path = await import('path')
        const os = await import('os')
        const tmp = path.join(os.tmpdir(), `dsa-commit-${Date.now()}.txt`)
        await fs.writeFile(tmp, msg, 'utf-8')
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
        'Push a branch to origin. Requires configured credentials (SSH or Windows Credential Manager).',
      parameters: { branch: 'string?', setUpstream: 'boolean?' },
      fn: async ({ branch, setUpstream }) => {
        const err = await ensureRepo()
        if (err) return err

        const b =
          branch && String(branch).trim()
            ? String(branch).trim()
            : (await runGit('git branch --show-current', workdir, 5000)).trim()
        if (!b) return 'Error: could not determine the branch to push.'

        const flag = setUpstream ? '-u ' : ''
        const target = quoteArgs(b)
        return runGit(`git push ${flag}origin ${target}`, workdir, 120_000)
      },
    },
  ]
}
