import React from 'react'
import { render } from 'ink'
import { SelectList } from '../src/tui/SelectList.js'
const items = Array.from({ length: 30 }, (_, i) => ({
  value: 'm' + i,
  label: 'модель-' + i,
}))
render(
  React.createElement(SelectList, {
    title: 'Много',
    items,
    initial: 'm15',
    onSelect: () => {},
  }),
  { exitOnCtrlC: false, patchConsole: false },
)
setInterval(() => {}, 1 << 30)
