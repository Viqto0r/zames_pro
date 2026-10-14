// Drive the REAL TuiEditor under a pty and log every onSubmit (text +
// attachments) so all paste kinds can be exercised: plain text, a big
// multi-line paste, a file path, and a data: URL image. The attach/clipboard
// callbacks mirror index.ts (parseImagePaste -> saveToTemp; resolveAttachPath
// -> readFile) so the probe exercises the same code path the live agent does.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { TuiEditor } from '../src/tui/TuiEditor.js'
import {
  contentHash,
  extForMime,
  guessMime,
  parseImagePaste,
  saveToTemp,
} from '../src/attachments.js'
import { resolveAttachPath } from '../src/attach-refs.js'

const LOG = process.env.PROBE_PASTE_LOG || '/tmp/paste-kinds.log'
const TMP = process.env.PROBE_PASTE_TMP || '/tmp/paste-probe-tmp'
const WORKDIR = process.cwd()
const line = (s: string): void => {
  fs.appendFileSync(LOG, s + String.fromCharCode(10))
}

const ed = new TuiEditor({
  prompt: '> ',
  commands: [],
  locale: 'en',
  alternateScreen: true,
})

ed.onSubmit = (text, atts) => {
  line(
    'SUBMIT text=' +
      JSON.stringify(text) +
      ' atts=' +
      JSON.stringify(
        atts.map((a) => ({ marker: a.marker, image: a.image, name: a.name })),
      ),
  )
}
ed.onAttach = async (raw: string) => {
  const image = parseImagePaste(raw)
  if (image) {
    const name = 'paste' + extForMime(image.mime)
    const p = await saveToTemp(TMP, name, image.data)
    const att = ed.attachments.add({
      path: p,
      name,
      mime: image.mime,
      size: image.data.length,
      hash: contentHash(image.data),
    })
    line('ATTACH_IMAGE ' + att.marker + ' ' + p)
    return att
  }
  const filePath = await resolveAttachPath(WORKDIR, raw)
  if (!filePath) return null
  const data = await fsp.readFile(filePath).catch(() => null)
  if (!data) return null
  const name = path.basename(filePath)
  const att = ed.attachments.add({
    path: filePath,
    name,
    mime: guessMime(name),
    size: data.length,
  })
  line('ATTACH_FILE ' + att.marker + ' ' + filePath)
  return att
}
ed.onClipboard = () => Promise.resolve(null)

ed.start()
setInterval(() => {}, 1 << 30)
