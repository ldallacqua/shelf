/**
 * pnpm desktop:icons
 *
 * Writes the app's icons (`desktop/icons/`) from the site's own, `src/app/icon.svg`, with the
 * Tauri CLI's `icon` command: the files `tauri.conf.json` names, and `icon.png`. At 16px, the tray
 * at 100%, that drawing's strokes land on half pixels and blur, so the 16px frame of `icon.ico` is
 * `desktop/icons/icon-16.svg` instead, drawn on whole pixels. Run it again when the mark changes,
 * and look at the icons before committing them.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ICONS = resolve('desktop/icons')
const KEPT = ['32x32.png', '64x64.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico']

/** The Tauri CLI, run by this Node itself: no shell between, so no argument is reread. */
const tauri = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [resolve('node_modules/@tauri-apps/cli/tauri.js'), 'icon', ...args],
    {
      stdio: 'ignore',
    },
  )

const out = mkdtempSync(join(tmpdir(), 'save-state-icons-'))
try {
  tauri(resolve('src/app/icon.svg'), '-o', out)
  for (const file of KEPT) copyFileSync(join(out, file), join(ICONS, file))

  const small = join(out, 'small')
  tauri(join(ICONS, 'icon-16.svg'), '-o', small, '-p', '16')
  const ico = join(ICONS, 'icon.ico')
  writeFileSync(ico, withFrame(readFileSync(ico), 16, readFileSync(join(small, '16x16.png'))))
  console.log(`Wrote ${KEPT.join(', ')} in ${ICONS}`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

/** The icon file with its frame of `size` replaced by `png`, every other frame as it was. */
function withFrame(ico: Buffer, size: number, png: Buffer): Buffer {
  const count = ico.readUInt16LE(4)
  const frames = Array.from({ length: count }, (_, i) => {
    const entry = 6 + i * 16
    const width = ico[entry] || 256
    const data =
      width === size
        ? png
        : ico.subarray(
            ico.readUInt32LE(entry + 12),
            ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8),
          )
    return { entry: Buffer.from(ico.subarray(entry, entry + 16)), data }
  })
  if (!frames.some((frame) => (frame.entry[0] || 256) === size))
    throw new Error(`icon.ico has no ${size}px frame`)
  let offset = 6 + count * 16
  for (const frame of frames) {
    frame.entry.writeUInt32LE(frame.data.length, 8)
    frame.entry.writeUInt32LE(offset, 12)
    offset += frame.data.length
  }
  return Buffer.concat([
    ico.subarray(0, 6),
    ...frames.map((frame) => frame.entry),
    ...frames.map((frame) => frame.data),
  ])
}
