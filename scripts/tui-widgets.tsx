import React from 'react'
import { render, Box, Text } from 'ink'
import {
  Checkbox,
  Select,
  Panel,
  HintBar,
  CodeBlock,
} from '../src/tui/widgets.js'
render(
  React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Text,
      null,
      'Checkbox: ',
      React.createElement(Checkbox, { checked: true, focused: true }),
      ' ',
      React.createElement(Checkbox, { checked: false, focused: false }),
    ),
    React.createElement(
      Text,
      null,
      'Select: ',
      React.createElement(Select, { value: 'qwen3.7-plus', focused: true }),
    ),
    React.createElement(
      Panel,
      { title: 'Панель', subtitle: '2', width: 50 },
      React.createElement(Text, null, 'содержимое'),
    ),
    React.createElement(HintBar, {
      hints: [
        ['↑/↓', 'выбор'],
        ['Enter', 'ok'],
        ['Esc', 'отмена'],
      ],
    }),
    React.createElement(CodeBlock, { code: 'const a = 1', lang: 'ts' }),
  ),
  { exitOnCtrlC: false, patchConsole: false },
)
setInterval(() => {}, 1 << 30)
