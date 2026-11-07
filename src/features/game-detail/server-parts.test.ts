import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A game's own page is drawn on the server (`/u/{handle}/game/{slug}`), and so are the parts of it
 * that are not client modules, such as the editor's skeleton. A hook they call must be one the
 * server can call: from a module marked `'use client'` it arrives as a reference to the browser's
 * code, and calling it fails the whole page. That is what happened to every game's page when the
 * skeleton started saying play time with `useDuration` (7 Nov 2026).
 */

const root = resolve(__dirname, '../../..')

/** The parts of a game's page that are drawn on the server: shared with the panel, not client modules. */
const drawnOnTheServer = [
  'src/features/game-detail/game-detail.tsx',
  'src/features/game-detail/mine-skeleton.tsx',
]

const isClientModule = (file: string) =>
  /^\s*['"]use client['"]/.test(readFileSync(join(root, file), 'utf8'))

/** Our own modules a file imports, with the names it takes from each. */
const importsOf = (file: string) => {
  const text = readFileSync(join(root, file), 'utf8')
  return [
    ...text.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+'(@\/[^']+|\.{1,2}\/[^']+)'/g),
  ].flatMap(([, names = '', from = '']) => {
    const base = from.startsWith('@/') ? join('src', from.slice(2)) : join(dirname(file), from)
    const found = ['.tsx', '.ts', '/index.ts']
      .map((end) => base + end)
      .find((each) => existsSync(join(root, each)))
    return found
      ? [{ file: found, names: names.split(',').map((name) => name.trim().split(/\s+as\s+/)[0]!) }]
      : []
  })
}

describe('the parts of a game’s page drawn on the server', () => {
  it.each(drawnOnTheServer)('%s is not a client module', (file) => {
    expect(isClientModule(file)).toBe(false)
  })

  it.each(drawnOnTheServer)('%s calls no hook of a client module', (file) => {
    const clientHooks = importsOf(file).flatMap(({ file: from, names }) =>
      isClientModule(from)
        ? names.filter((name) => /^use[A-Z]/.test(name)).map((name) => `${name} from ${from}`)
        : [],
    )
    expect(clientHooks).toEqual([])
  })
})
