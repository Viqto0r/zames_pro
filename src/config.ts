import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ZamesConfig } from './types.js'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HOME_CONFIG = path.join(ZAMES_HOME, 'config.json')
const PROJECT_CONFIG = path.join(process.cwd(), '.zamesrc.json')

export const DEFAULTS: ZamesConfig = {
  maxIterations: 40,
  headless: false,
  debug: false,
  browserChannel: null,

  confirmation: {
    write: true,
    edit: true,
    bash: true,
    alwaysConfirm: [
      'rm\s+-rf',
      'rmdir\s+/s',
      'del\s+/[sqf]',
      'format\s+[a-z]:',
      'shutdown',
      'reg\s+delete',
      'remove-item.*-recurse',
      'git\s+push\s+--force',
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
    minSendIntervalMs: 2000,
    rateLimitWaitMs: 300000,
    maxRateLimitRetries: 6,
  },
}

export function loadConfig(): ZamesConfig {
  const merged = JSON.parse(JSON.stringify(DEFAULTS)) as ZamesConfig
  for (const file of [HOME_CONFIG, PROJECT_CONFIG]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      deepMerge(merged as unknown as Record<string, unknown>, data)
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') {
        console.error(`config: не удалось прочитать ${file}: ${err.message}`)
      }
    }
  }
  return merged
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      target[key] = (target[key] as Record<string, unknown>) || {}
      deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      )
    } else {
      target[key] = source[key]
    }
  }
}

export const CONFIG_PATHS = { HOME_CONFIG, PROJECT_CONFIG }
export { ZAMES_HOME }
