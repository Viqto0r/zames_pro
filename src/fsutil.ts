import fs from 'fs'
import path from 'path'

// One atomic writer shared by config, sessions and undo. Writing to a temp
// file in the SAME directory and renaming over the target is atomic on POSIX
// and Windows (same volume), so a crash or Ctrl+C mid-write can never leave a
// truncated/broken file behind. The temp name embeds the pid so two
// concurrent processes never collide on it.
//
// Kept in its own module because the pattern used to be copy-pasted in at
// least three places; drift between the copies is exactly how one of them
// silently loses its atomicity.
//
// The file is created 0o600: ~/.zames/config.json holds the
// browser password in clear text alongside sessions/undo history, and the
// default umask (022) would make them readable by other users on a
// multi-user machine. We also chmod the target after rename because a
// pre-existing file keeps its old mode (rename does not change the inode).
export function writeFileAtomic(file: string, data: string | Buffer): void {
  const tmp = file + '.tmp-' + process.pid
  // fsync the file BEFORE rename: without it a power loss can leave the
  // renamed name pointing at an empty/partial inode (rename itself is atomic,
  // but the data blocks may not have reached the disk yet).
  const fd = fs.openSync(tmp, 'w', 0o600)
  try {
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
  // fsync the DIRECTORY so the rename entry itself is durable.
  try {
    const dirFd = fs.openSync(path.dirname(file), 'r')
    try {
      fs.fsyncSync(dirFd)
    } finally {
      fs.closeSync(dirFd)
    }
  } catch {
    // Some platforms/filesystems do not allow opening a directory; best-effort.
  }
  // Best-effort: on Windows chmod is largely a no-op and can throw.
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // ignore
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(
    file,
    JSON.stringify(value, null, 2) + String.fromCharCode(10),
  )
}
