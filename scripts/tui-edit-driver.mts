// Drive scripts/tui-edit-probe.tsx under a pty with a scripted key sequence,
// then print the LAST buffer state the probe logged.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ESC = String.fromCharCode(27)
const LOG = '/tmp/edit-probe.log'

function arg(name: string, def = ''): string {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : def
}
const seed = arg('seed', '')
const keys = arg('keys', '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s) =>
    s === 'CTDL'
      ? ESC + '[3;5~'
      : s === 'CTDLU'
        ? ESC + '[3;5u'
        : s === 'CTB127U'
          ? ESC + '[127;5u'
          : s === 'DELU'
            ? ESC + '[3u'
            : s === 'BSU'
              ? ESC + '[127u'
              : s === 'CTRLBS'
                ? ESC + String.fromCharCode(127)
                : s === 'CTB08'
                  ? String.fromCharCode(8)
                  : s === 'DEL'
                    ? ESC + '[3~'
                    : s === 'CTRLUNDO'
                      ? String.fromCharCode(31)
                      : s === 'CTRLU'
                        ? String.fromCharCode(21)
                        : s === 'CTRLK'
                          ? String.fromCharCode(11)
                          : s === 'CTRLR'
                            ? String.fromCharCode(18)
                            : s === 'ESCAPE'
                              ? ESC
                              : s === 'CTRLW'
                                ? String.fromCharCode(23)
                                : s === 'LEFT'
                                  ? ESC + '[D'
                                  : s === 'RIGHT'
                                    ? ESC + '[C'
                                    : s === 'UP'
                                      ? ESC + '[A'
                                      : s === 'DOWN'
                                        ? ESC + '[B'
                                        : s === 'ENTER'
                                          ? String.fromCharCode(13)
                                          : s,
  )

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-edit-probe.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: '80',
      LINES: '24',
      PROBE_EDIT_LOG: LOG,
      PROBE_EDIT_SEED: seed,
    },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

let i = 0
const tick = (): void => {
  if (i < keys.length) {
    child.stdin.write(keys[i])
    i++
    setTimeout(tick, 200)
  } else {
    setTimeout(() => child.kill('SIGTERM'), 300)
  }
}
setTimeout(tick, 5000)
child.on('close', () => {
  let lines: string[] = []
  try {
    lines = fs.readFileSync(LOG, 'utf-8').trim().split(String.fromCharCode(10))
  } catch {
    /* ignore */
  }
  console.log(
    'SEED=' + JSON.stringify(seed) + ' KEYS=' + JSON.stringify(arg('keys', '')),
  )
  console.log('FINAL=' + (lines[lines.length - 1] || '(none)'))
  process.exit(0)
})
