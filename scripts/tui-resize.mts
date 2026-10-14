// Resize a REAL TuiEditor under a pty and screenshot the final grid. The pty
// WINSIZE is changed mid-run so the kernel delivers SIGWINCH, which exercises
// TuiEditor.installResizeHandler (unmount + remount), not just Ink's erase.
//
// Usage: npx tsx scripts/tui-resize.mts [sc sr nc nr text]
import { spawnSync } from 'node:child_process'
import { Term } from '../test/vt100.mts'

const NL = String.fromCharCode(10)
const sc = Number(process.argv[2] || 80)
const sr = Number(process.argv[3] || 24)
const nc = Number(process.argv[4] || 100)
const nr = Number(process.argv[5] || 30)
const text = process.argv[6] || ''

// Inline python pty harness (no external file).
const py = [
  'import os,pty,sys,time,fcntl,termios,struct,signal,select',
  'sc,sr,nc,nr=' + sc + ',' + sr + ',' + nc + ',' + nr,
  'text=' + JSON.stringify(text),
  'pid,fd=pty.fork()',
  'if pid==0:',
  "    os.environ['COLUMNS']=str(sc); os.environ['LINES']=str(sr)",
  "    os.execvp('npx',['npx','tsx','scripts/tui-editor-probe.tsx'])",
  'else:',
  "    def sz(c,r): fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',r,c,0,0))",
  '    sz(sc,sr)',
  "    buf=b''; start=time.time(); sent=False; resized=False",
  '    while time.time()-start<14:',
  '        t=time.time()-start',
  '        if not sent and t>5:',
  '            for ch in text:',
  '                os.write(fd,ch.encode()); time.sleep(0.12)',
  '            sent=True',
  '        if not resized and t>9:',
  '            sz(nc,nr); os.kill(pid,signal.SIGWINCH); resized=True',
  '        r,_,_=select.select([fd],[],[],0.2)',
  '        if r:',
  '            try:',
  '                d=os.read(fd,65536)',
  '                if not d: break',
  '                buf+=d',
  '            except OSError: break',
  '    time.sleep(0.5)',
  '    try:',
  '        while True:',
  '            r,_,_=select.select([fd],[],[],0.2)',
  '            if not r: break',
  '            d=os.read(fd,65536)',
  '            if not d: break',
  '            buf+=d',
  '    except OSError: pass',
  '    try: os.kill(pid,signal.SIGKILL)',
  '    except ProcessLookupError: pass',
  '    sys.stdout.buffer.write(buf)',
].join(NL)

const out = spawnSync('python3', ['-c', py], {
  encoding: 'buffer',
  maxBuffer: 64 * 1024 * 1024,
})
const term = new Term(Math.max(sr, nr), Math.max(sc, nc))
term.write(out.stdout.toString('utf-8'))
process.stdout.write(
  term
    .render()
    .split(NL)
    .map((l, n) => String(n).padStart(2) + '| ' + l)
    .join(NL) + NL,
)
