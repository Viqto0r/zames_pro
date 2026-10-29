// Replay a SCRIPTED session through the REAL Ink TUI, for recording the demo
// animation (docs/demo.mp4 / demo.gif).
//
// Why a replay and not a live run: a real task against the web chat is
// dominated by things we cannot control — the model's latency (5-20 s), the
// send throttle (15 s on DeepSeek), the network. Recorded as is, the demo is
// mostly waiting, and every take differs. The UI, however, is the thing worth
// showing, and it is driven imperatively (`toolCall`, `toolResult`,
// `assistant`, ...), so the same calls can be fed from a script with a
// convincing cadence.
//
// Run:  npm run demo:replay            (paced: waits for Enter between steps)
//       npm run demo:replay -- --auto  (no key waits; for screen recording)
//
// It runs in its OWN full-screen Ink app, so it never touches the browser,
// ~/.zames/profile or a running agent.

import { TuiEditor } from '../src/tui/TuiEditor.js'
import { applyTheme } from '../src/theme.js'
import { initialEditState } from '../src/tui/edit.js'
import type { SlashCommand } from '../src/input/layout.js'

const NL = String.fromCharCode(10)
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

const auto = process.argv.includes('--auto')
const themeArg = process.argv.find((a) => a.startsWith('--theme='))
applyTheme(themeArg ? themeArg.slice('--theme='.length) : 'zames')

const workdir = process.cwd()
const version = '2.90.16'

const COMMANDS: SlashCommand[] = [
  { name: '/help', description: 'List the commands' },
  { name: '/provider', description: 'Switch the chat backend' },
  { name: '/model', description: 'Pick a model' },
  { name: '/plan', description: 'Read-only plan mode' },
  { name: '/undo', description: 'Revert the last edit' },
  { name: '/diff', description: 'Show the working-tree diff' },
  { name: '/cost', description: 'Session stats' },
  { name: '/exit', description: 'Quit' },
]

const editor = new TuiEditor({
  prompt: '\u276f ',
  commands: COMMANDS,
  locale: 'en',
  alternateScreen: true,
})
editor.setTmpDir(workdir + '/tmp')
editor.setProvider('DeepSeek')
editor.setHeader({ title: 'zames', version, workdir, mouseScroll: true })
editor.setContextLimit(1_000_000)
editor.onContextQuery = () => 12_400
editor.onTasksQuery = () => 'tasks: 2/4'
editor.onQueueQuery = () => 0
editor.onToggleQuery = () => ({ deepThinking: true, webSearch: false })

if (!editor.start()) {
  console.error('demo-replay needs a TTY (run it in a terminal, not a pipe)')
  process.exit(1)
}

async function waitKey(label: string): Promise<void> {
  if (auto) {
    await sleep(400)
    return
  }
  await new Promise<void>((resolve) => {
    process.stderr.write(NL + '  [Enter] ' + label + NL)
    const onData = (d: Buffer): void => {
      const s = d.toString('utf-8')
      if (s.includes('\r') || s.includes('\n')) {
        process.stdin.off('data', onData)
        resolve()
      }
    }
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

// The task is typed through the store so the REAL input line renders it
// (wrapping, cursor, hints): a viewer expects to see it appear before the send.
async function typePrompt(text: string, perChar = 26): Promise<void> {
  for (let i = 1; i <= text.length; i++) {
    editor.store.set({
      edit: { ...initialEditState(), buf: text.slice(0, i), cursor: i },
    })
    await sleep(perChar)
  }
}

async function tool(
  name: string,
  args: Record<string, unknown>,
  result: string,
  ms = 900,
): Promise<void> {
  editor.toolCall(name, args)
  await sleep(ms)
  editor.toolResult(result)
  await sleep(260)
}

const question = 'what is zames?'

editor.printAbove('\u001b[2mWorking directory:\u001b[0m ' + workdir)
editor.printAbove('\u001b[2mVersion:\u001b[0m ' + version)
editor.printAbove('')

await waitKey('start: type the task')
await typePrompt(question)
await sleep(300)

// The operator's own message through the REAL submit path (turn rule +
// bar-marked rows). onSubmit is a no-op: no browser, no chat, just the UI.
editor.onSubmit = () => {}
editor.submitQuestion(question)
editor.busy = true
editor.thinking()
await sleep(700)

await tool(
  'Read',
  { path: 'package.json' },
  '{\n  "name": "zames_pro",\n  "version": "2.90.16",\n  "description": "Terminal coding agent that drives a real browser…",\n  "bin": { "zames": "dist/index.js" }\n}',
)
await tool(
  'Read',
  { path: 'docs/readme.en.md', offset: 1, limit: 40 },
  '# zames_pro — a terminal coding agent that drives a real web chat LLM (DeepSeek, Qwen, GLM) through a browser…',
)
await tool(
  'Grep',
  { pattern: 'no API key', include: '*.md' },
  'README.md:44  A terminal coding agent that works on top of real web chat LLMs…\ndocs/readme.en.md:31  > No API key required…',
)
await tool(
  'Glob',
  { pattern: 'src/*.ts' },
  'src/agent-loop.ts\nsrc/browser.ts\nsrc/index.ts\nsrc/system-prompt.ts\nsrc/tools.ts\n… 41 more',
)
await tool(
  'Bash',
  { command: 'git log --oneline -3' },
  '714653e chore: release 2.90.16\nabf53e2 fix(browser): apply the sanitized headless UA\n4ff6770 chore: release 2.90.15',
)

editor.thinking()
await sleep(500)

editor.assistant(
  [
    '**zames_pro** is a free, open-source **terminal coding agent** that runs on the',
    'web chat you already have — no API key, no per-token bill.',
    '',
    'It drives a real (headless) Chromium to your **DeepSeek**, **Qwen** or **GLM**',
    'chat account, types the task like a user and runs the tool calls locally:',
    '`Read`, `Write`, `Edit`, `Bash`, git and MCP tools, subagents, `AGENTS.md`,',
    'skills and slash commands — the Claude Code workflow, on a chat account.',
    '',
    '```bash',
    'npm install -g zames_pro   # then run: zames',
    '```',
  ].join(NL),
)
editor.busy = false

await waitKey('done: the answer is on screen (Enter to exit)')
editor.stop()
process.exit(0)
