import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = fileURLToPath(new URL('..', import.meta.url))
const sheets = globSync('**/*.css', { cwd: source })

describe('stylesheets', () => {
  it('are found', () => {
    expect(sheets.length).toBeGreaterThan(5)
  })

  /*
   * A character beyond ASCII typed into `content` survives only as long as every tool that writes
   * the file reads it as UTF-8: one that did not turned a minus into "âˆ’" on a game's page. Draw
   * a mark, or write the character as an escape (`'\2212'`).
   */
  it.each(sheets)('%s writes only ASCII in content', (sheet) => {
    const css = readFileSync(`${source}/${sheet}`, 'utf8')
    const typed = [...css.matchAll(/content:\s*(['"])(.*?)\1/g)]
      .map((match) => match[2]!)
      .filter((value) => /[^\x20-\x7e]/.test(value))
    expect(typed).toEqual([])
  })
})
