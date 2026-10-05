import fs from 'fs'

// One atomic writer shared by config, sessions and undo. Writing to a temp
// file in the SAME directory and renaming over the target is atomic on POSIX
// and Windows (same volume), so a crash or Ctrl+C mid-write can never leave a
// truncated/broken file behind. The temp name embeds the pid so two
// concurrent processes never collide on it.
//
// Kept in its own module because the pattern used to be copy-pasted in at
// least three places; drift between the copies is exactly how one of them
// silently loses its atomicity.
export function writeFileAtomic(file: string, data: string | Buffer): void {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(
    file,
    JSON.stringify(value, null, 2) + String.fromCharCode(10),
  )
}
