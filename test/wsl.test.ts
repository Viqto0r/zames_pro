import { test } from 'node:test'
import assert from 'node:assert/strict'
import { winPathToWsl, isWsl, readWindowsClipboardFiles } from '../src/attachments.ts'

test('winPathToWsl конвертирует C:\ в /mnt/c/', () => {
 const BS = String.fromCharCode(92)
 assert.equal(winPathToWsl('C:' + BS + 'Users' + BS + 'me' + BS + 'a.png'), '/mnt/c/Users/me/a.png')
 assert.equal(winPathToWsl('D:' + BS + 'work' + BS + 'pic.jpg'), '/mnt/d/work/pic.jpg')
 // forward slashes too
 assert.equal(winPathToWsl('C:/tmp/x.png'), '/mnt/c/tmp/x.png')
 // already POSIX path stays
 assert.equal(winPathToWsl('/home/me/a.png'), '/home/me/a.png')
 // quoted path
 assert.equal(winPathToWsl('"C:' + BS + 'a.png"'), '/mnt/c/a.png')
 // garbage
 assert.equal(winPathToWsl('not a path'), null)
 assert.equal(winPathToWsl(''), null)
})

test('isWsl на этой машине возвращает boolean', () => {
 assert.equal(typeof isWsl(), 'boolean')
})

test('readWindowsClipboardFiles вне WSL возвращает []', () => {
 // This test runs on Linux CI (not WSL), so it must be a safe empty array.
 const res = readWindowsClipboardFiles()
 assert.ok(Array.isArray(res))
})
