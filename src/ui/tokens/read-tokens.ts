/**
 * Reads the token stylesheets as data, for tests and scripts.
 * It understands exactly the shape those files are written in: flat blocks of
 * custom properties, where a value is a literal or a single var() reference.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = import.meta.dirname

export type TokenMap = Map<string, string>

function read(file: string): string {
  return readFileSync(join(directory, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The custom properties declared in the first block whose selector matches. */
function block(css: string, selector: RegExp): TokenMap {
  const tokens: TokenMap = new Map()
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, rawSelector = '', body = ''] = match
    if (!selector.test(rawSelector.trim())) continue
    for (const declaration of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name = '', value = ''] = declaration
      tokens.set(name, value.trim())
    }
    return tokens
  }
  throw new Error(`No block matches ${selector}`)
}

export function readPalette(): TokenMap {
  return block(read('palette.css'), /^:root$/)
}

export function readTheme(theme: 'light' | 'dark'): TokenMap {
  const selector = theme === 'light' ? /\[data-theme='light'\]$/ : /^\[data-theme='dark'\]$/
  const css = read('theme.css')
  // The LED's resting color is declared once, for every themed element.
  return new Map([...block(css, /\[data-theme\]$/), ...block(css, selector)])
}

export function readMotion(): { durations: TokenMap; curves: TokenMap } {
  const css = read('motion.css')
  return { durations: block(css, /^:root$/), curves: block(css, /^@theme static$/) }
}

/** Registered properties: name to { syntax, initial value }. */
export function readProperties(): Map<string, { syntax: string; initial: string }> {
  const properties = new Map<string, { syntax: string; initial: string }>()
  const pattern =
    /@property\s+(--[\w-]+)\s*\{\s*syntax:\s*'([^']+)';\s*inherits:\s*true;\s*initial-value:\s*([^;]+);\s*\}/g
  for (const match of read('properties.css').matchAll(pattern)) {
    const [, name = '', syntax = '', initial = ''] = match
    properties.set(name, { syntax, initial: initial.trim() })
  }
  return properties
}

/** Follows var() references through the theme and the palette to a literal value. */
export function resolve(name: string, theme: TokenMap, palette: TokenMap): string {
  let value = theme.get(name) ?? palette.get(name)
  for (let hops = 0; value !== undefined && hops < 5; hops += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value)
    if (!reference?.[1]) return value
    value = theme.get(reference[1]) ?? palette.get(reference[1])
  }
  throw new Error(`Cannot resolve ${name}`)
}
