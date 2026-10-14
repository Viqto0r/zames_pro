// Mount EACH standalone TUI component (SelectList, ConfirmDialog, LoginForm,
// TextPrompt) under a pty so every menu can be screenshotted and driven.
// Pick the component with PROBE_COMPONENT.

import React from 'react'
import { render } from 'ink'
import { SelectList } from '../src/tui/SelectList.js'
import { ConfirmDialog } from '../src/tui/ConfirmDialog.js'
import { LoginForm } from '../src/tui/LoginForm.js'
import { TextPrompt } from '../src/tui/TextPrompt.js'
import { translate } from '../src/i18n.js'

const which = process.env.PROBE_COMPONENT || 'select'
const t = translate('ru')

function node(): React.ReactElement {
  switch (which) {
    case 'select':
      return React.createElement(SelectList, {
        title: 'Модель Qwen',
        initial: 'qwen3.7-plus',
        items: [
          { value: 'qwen3.7-plus', label: 'qwen3.7-plus', detail: '← текущая' },
          { value: 'qwen3.8-max', label: 'qwen3.8-max' },
          {
            value: 'qwen3.8-omni-flash',
            label: 'qwen3.8-omni-flash',
            description: 'быстрая',
          },
          { value: 'qwen3.7-max', label: 'qwen3.7-max' },
          { value: 'qwen3.6-plus', label: 'qwen3.6-plus' },
        ],
        onSelect: () => {},
      })
    case 'confirm':
      return React.createElement(ConfirmDialog, {
        title: 'Подтверждение',
        message: 'Выполнить Bash: rm -rf build ?',
        yesLabel: 'Да',
        noLabel: 'Нет',
        onAnswer: () => {},
      })
    case 'login':
      return React.createElement(LoginForm, { t, onResult: () => {} })
    case 'text':
      return React.createElement(TextPrompt, {
        t,
        label: 'Одноразовый код',
        secret: false,
        onResult: () => {},
      })
    default:
      return React.createElement(SelectList, {
        title: 'x',
        items: [],
        onSelect: () => {},
      })
  }
}

render(node(), { exitOnCtrlC: false, patchConsole: false })
setInterval(() => {}, 1 << 30)
