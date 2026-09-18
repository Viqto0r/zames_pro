import chalk from 'chalk'

// Мягкая палитра для чтения в тёмном терминале.
// Подобрана в духе One Dark / Nord: приглушённые тона вместо кислотных.
// Разные роли намеренно различаются по цвету:
//   - tool call   — тёплый янтарный
//   - tool result — приглушённый серо-синий
//   - user        — бирюзовый
//   - assistant   — спокойный зелёный
//   - system      — серый
//   - warn        — мягкий жёлтый
//   - error       — приглушённый красный

export const theme = {
  user: chalk.hex('#5fd7d7'), // бирюзовый
  assistant: chalk.hex('#98c379'), // спокойный зелёный (One Dark green)
  tool: chalk.hex('#e5c07b'), // тёплый янтарный (One Dark yellow)
  toolResult: chalk.hex('#7f9cc0'), // приглушённый серо-синий
  system: chalk.hex('#7d8590'), // серый
  dim: chalk.hex('#5c6370'), // тёмно-серый
  warn: chalk.hex('#e0af68'), // мягкий жёлтый
  error: chalk.hex('#e06c75'), // приглушённый красный
  success: chalk.hex('#98c379'), // тот же зелёный, что и assistant
  bold: chalk.bold,
}

export default theme
