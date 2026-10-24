import fs from 'fs'
import path from 'path'

// One atomic writer shared by config, sessions and undo. Writing to a temp
// file in the SAME directory and renaming over the target is atomic on POSIX
// and Windows (same volume), so a crash or Ctrl+C mid-write can never leave a
// truncated/broken file behind. The temp name embeds the pid so two
// concurrent processes never collide on it.
//
// The file is created 0o600: ~/.zames/config.json holds the
// browser password in clear text alongside sessions/undo history, and the
// default umask (022) would make them readable by other users on a
// multi-user machine. We also chmod the target after rename because a
// pre-existing file keeps its old mode (rename does not change the inode).
export function writeFileAtomic(file: string, data: string | Buffer): void {
  // Follow a SYMLINK first: a dotfiles setup links ~/.zames/config.json into a
  // git repo, and a project may link .zamesrc.json. Renaming a temp file over
  // the link replaces the LINK with a regular file — the real target keeps the
  // stale content and the next launch reads what the operator never edited.
  let target = file
  try {
    target = fs.realpathSync(file)
  } catch {
    // Missing (first write) or a BROKEN link. A broken link must still be
    // written THROUGH: resolve its own target lexically (readlink + dirname)
    // and create it, otherwise `rename` replaces the LINK with a regular file
    // and the real target (a dotfiles repo checkout that does not exist yet)
    // is never created.
    try {
      if (fs.lstatSync(file).isSymbolicLink()) {
        const raw = fs.readlinkSync(file)
        target = path.resolve(path.dirname(file), raw)
      }
    } catch {
      // Not a link: write to the path itself.
    }
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
  } catch {
    // Best-effort: a failed mkdir surfaces as the write error below.
  }
  const tmp = target + '.tmp-' + process.pid
  // fsync the file BEFORE rename: without it a power loss can leave the
  // renamed name pointing at an empty/partial inode (rename itself is atomic,
  // but the data blocks may not have reached the disk yet).
  try {
    const fd = fs.openSync(tmp, 'w', 0o600)
    try {
      fs.writeFileSync(fd, data)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmp, target)
  } catch (e) {
    // A failed write/fsync/rename (full disk, EIO, a directory in the way)
    // must not leave the temp file behind: every failure used to accumulate a
    // stray `<file>.tmp-<pid>` next to the real file.
    try {
      fs.unlinkSync(tmp)
    } catch {}
    throw e
  }
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
