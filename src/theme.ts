import chalk from 'chalk'
import { contentWidth } from './width.js'

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
// spans the SHARED content width (src/width.ts) so the rule, the answers and
// the tool previews all line up at the same margin. The `max` argument is kept
// for a shorter rule in special call sites; by default it is the content width.
export function divider(max?: number): string {
  const width = max && max > 0 ? Math.min(max, contentWidth()) : contentWidth()
  return '─'.repeat(width)
}

export default theme
