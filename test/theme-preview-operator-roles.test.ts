import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewLines } from '../src/tui/theme-preview.tsx'

// A theme picker must show what the operator ACTUALLY sees, otherwise a theme
// with an unreadable operator bar or input frame is chosen blind. The preview
// covered answers, tools, warnings — but NOT the operator's own turn
// (`user` + `userBar`), which is the most prominent surface in the TUI, nor
// the frame rule (`turnRule`) that draws the input box.
//
// The guard pins that those roles are previewed, so a future cleanup cannot
// silently drop them again.

test('the preview shows the operator turn and the input frame', () => {
  const roles = new Set(previewLines().map((l) => l.role as string))
  for (const role of ['user', 'userBar', 'turnRule']) {
    assert.ok(roles.has(role), 'the preview misses the "' + role + '" role')
  }
})

test('the preview still covers the answer and the tools', () => {
  const roles = new Set(previewLines().map((l) => l.role as string))
  for (const role of ['prompt', 'assistant', 'tool', 'toolResult', 'error']) {
    assert.ok(roles.has(role), 'missing ' + role)
  }
})
