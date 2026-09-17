import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const HOME_CONFIG = path.join(os.homedir(), '.ds-agent', 'config.json')
const PROJECT_CONFIG = path.join(PROJECT_ROOT, '.dsagentrc.json')

const DEFAULTS = {
  projectsRoot: path.join(PROJECT_ROOT, 'projects'),
  maxIterations: 40,
  headless: false,
  debug: false,
  browserChannel: 'chrome',

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
    dir: path.join(os.homedir(), '.ds-agent', 'logs'),
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
