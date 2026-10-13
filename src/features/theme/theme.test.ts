import { describe, expect, it } from 'vitest'

import { readPalette, readTheme, resolve } from '@/ui/tokens/read-tokens'

import {
  changeDirection,
  parseThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeColor,
  themeScript,
} from './theme'

describe('parseThemeChoice', () => {
  it('keeps the two explicit choices', () => {
    expect(parseThemeChoice('light')).toBe('light')
    expect(parseThemeChoice('dark')).toBe('dark')
  })

  it.each([null, undefined, '', 'system', 'DARK', 'sepia', 42, {}])(
    'treats %j as "follow the device"',
    (value) => {
      expect(parseThemeChoice(value)).toBe('system')
    },
  )
})

describe('resolveTheme', () => {
  it('follows the device when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the device when a theme is chosen', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('themeColor', () => {
  it("keeps the browser's own chrome the color of the wall", () => {
    const palette = readPalette()
    for (const theme of ['light', 'dark'] as const) {
      expect(themeColor[theme]).toBe(resolve('--wall', readTheme(theme), palette))
    }
  })
})

describe('changeDirection', () => {
  it('names which way the light is going', () => {
    expect(changeDirection('dark')).toBe('to-dark')
    expect(changeDirection('light')).toBe('to-light')
  })
})

/**
 * The inline script runs before anything else on the page, so it is tested
 * as the browser runs it: as a string, against a minimal fake page.
 */
describe('themeScript', () => {
  type Fake = {
    stored?: string | null
    deviceIsDark?: boolean
    storageThrows?: boolean
    matchMediaMissing?: boolean
  }

  function run({ stored = null, deviceIsDark = false, storageThrows, matchMediaMissing }: Fake) {
    const attributes = new Map<string, string>()
    const metas: { name: string; content: string }[] = []
    const document = {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
      createElement: () => ({ name: '', content: '' }),
      head: { appendChild: (meta: { name: string; content: string }) => metas.push(meta) },
    }
    const localStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('blocked')
        return key === THEME_STORAGE_KEY ? stored : null
      },
    }
    const matchMedia = matchMediaMissing
      ? undefined
      : (query: string) => ({
          matches: query.includes('prefers-color-scheme: dark') && deviceIsDark,
        })

    new Function('document', 'localStorage', 'matchMedia', themeScript())(
      document,
      localStorage,
      matchMedia,
    )
    return {
      theme: attributes.get('data-theme'),
      choice: attributes.get('data-theme-choice'),
      metas,
    }
  }

  it('follows a dark device when nothing is stored', () => {
    expect(run({ deviceIsDark: true })).toMatchObject({ theme: 'dark', choice: 'system' })
  })

  it('follows a light device when nothing is stored', () => {
    expect(run({ deviceIsDark: false })).toMatchObject({ theme: 'light', choice: 'system' })
  })

  it('lets a stored choice beat the device', () => {
    expect(run({ stored: 'light', deviceIsDark: true })).toMatchObject({
      theme: 'light',
      choice: 'light',
    })
    expect(run({ stored: 'dark', deviceIsDark: false })).toMatchObject({
      theme: 'dark',
      choice: 'dark',
    })
  })

  it('ignores a stored value it does not know', () => {
    expect(run({ stored: 'sepia', deviceIsDark: true })).toMatchObject({
      theme: 'dark',
      choice: 'system',
    })
  })

  it('still works when storage is blocked', () => {
    expect(run({ storageThrows: true, deviceIsDark: true })).toMatchObject({
      theme: 'dark',
      choice: 'system',
    })
  })

  it('falls back to light when the device cannot be asked', () => {
    expect(run({ matchMediaMissing: true })).toMatchObject({ theme: 'light', choice: 'system' })
  })

  it("sets the browser's theme color to the wall", () => {
    expect(run({ deviceIsDark: true }).metas).toEqual([
      { name: 'theme-color', content: themeColor.dark },
    ])
    expect(run({ deviceIsDark: false }).metas).toEqual([
      { name: 'theme-color', content: themeColor.light },
    ])
  })

  it('is one statement with no line breaks, safe to inline in <head>', () => {
    const script = themeScript()
    expect(script).not.toMatch(/[\n<]/)
    expect(script.startsWith('(function(){')).toBe(true)
  })
})
