import fs from 'fs'
import path from 'path'
import os from 'os'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HOME_CONFIG = path.join(ZAMES_HOME, 'config.json')
const PROJECT_CONFIG = path.join(process.cwd(), '.zamesrc.json')

const DEFAULTS = {
  maxIterations: 40,
  headless: false,
  debug: false,
  browserChannel: null,

  confirmation: {
    write: true,
    edit: true,
    bash: true,
    alwaysConfirm: [
      'rm\\s+-rf',
      'rmdir\\s+/s',
      'del\\s+/[sqf]',
      'format\\s+[a-z]:',
      'shutdown',
      'reg\\s+delete',
      'remove-item.*-recurse',
      'git\\s+push\\s+--force',
    ],
  },

  undo: {
    enabled: true,
    maxBackups: 200,
  },

  transcript: {
    enabled: true,
    dir: path.join(os.homedir(), '.zames', 'logs'),
  },

  browser: {
    answerTimeoutMs: 180000,
    askRetries: 3,
    stabilityChecks: 3,
    stabilityDelayMs: 1000,
  },
}

export function loadConfig() {
  const merged = JSON.parse(JSON.stringify(DEFAULTS))
  for (const file of [HOME_CONFIG, PROJECT_CONFIG]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      deepMerge(merged, data)
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error(`config: не удалось прочитать ${file}: ${e.message}`)
      }
    }
  }
  return merged
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      target[key] = target[key] || {}
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
}

export const CONFIG_PATHS = { HOME_CONFIG, PROJECT_CONFIG }
export { ZAMES_HOME }
