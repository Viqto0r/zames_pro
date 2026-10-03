import chalk from 'chalk'

// A calm palette for a dark terminal.
// Muted, slightly "faded" tones without high saturation
// (in the spirit of Tokyo Night / Nord). The goal is comfortable reading of
// long answers, not maximum contrast.
//
// Roles:
//   - user        — soft lavender-gray (service messages)
//   - prompt      — warm gold (input prompt, noticeable)
//   - dir         — light blue (working directory name)
//   - assistant   — warm sand (model answers)
//   - tool        — muted amber
//   - toolResult  — gray-blue
//   - system      — neutral gray
//   - warn        — calm ochre
//   - error       — muted terracotta

export const theme = {
  user: chalk.hex('#b4b8d0'), // soft lavender-gray
  prompt: chalk.hex('#c8b06a').bold, // input prompt — warm gold, noticeable
  dir: chalk.hex('#7fc4f0'), // working directory name — noticeably blue
  assistant: chalk.hex('#cfc9b0'), // warm sand
  tool: chalk.hex('#c6a97e'), // muted amber
  toolResult: chalk.hex('#8a9bb5'), // gray-blue
  system: chalk.hex('#808896'), // neutral gray
  dim: chalk.hex('#5b616e'), // dark gray
  taskSummary: chalk.hex('#8fa3c8'), // per-task summary — noticeable but calm, distinct from spinner brown and warn ochre
  warn: chalk.hex('#c9a86a'), // calm ochre
  error: chalk.hex('#c98a80'), // muted terracotta
  success: chalk.hex('#a9c08c'), // soft sage
  brown: chalk.hex('#a1723f'), // brown (status/spinner)
  toggleOn: chalk.hex('#6fd0b0'), // teal-green — a toggle is ON
  bold: chalk.bold,
}

// Horizontal rule that separates the model's answer from the next block. It
// spans the terminal width (capped at `max`) so it does not look stubby on a
// wide terminal. Falls back to 60 columns when the width is unknown (non-TTY).
// One column is kept free, like everywhere else in the status/input layout, so
// a full-width rule cannot trigger autowrap.
export function divider(max = 100): string {
  const cols = process.stdout.columns || 0
  const width = Math.max(20, Math.min(max, cols ? cols - 1 : 60))
  return '─'.repeat(width)
}

export default theme
