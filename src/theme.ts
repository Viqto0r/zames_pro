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
  warn: chalk.hex('#c9a86a'), // calm ochre
  error: chalk.hex('#c98a80'), // muted terracotta
  success: chalk.hex('#a9c08c'), // soft sage
  brown: chalk.hex('#a1723f'), // brown (status/spinner)
  bold: chalk.bold,
}

export default theme
