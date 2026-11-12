import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { BlackSwitch } from './black-switch'
import { BLACK_STORAGE_KEY, BLACK_WALL, chromeProperty } from './theme'

const root = document.documentElement

describe('BlackSwitch', () => {
  afterEach(() => {
    root.removeAttribute('data-black')
    root.removeAttribute('style')
    window.localStorage.removeItem(BLACK_STORAGE_KEY)
  })

  it('is a switch named in words and described by what it does', () => {
    renderWithIntl(<BlackSwitch />)

    const toggle = screen.getByRole('switch', { name: 'Pure black with the lights off' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(/For OLED screens/)
  })

  it('turns pure black on, remembers it, and makes the chrome black with the lights off', async () => {
    root.dataset.theme = 'dark'
    renderWithIntl(<BlackSwitch />)

    await userEvent.click(screen.getByRole('switch', { name: 'Pure black with the lights off' }))

    expect(root.hasAttribute('data-black')).toBe(true)
    expect(window.localStorage.getItem(BLACK_STORAGE_KEY)).toBe('1')
    expect(root.style.getPropertyValue(chromeProperty.dark)).toBe(BLACK_WALL)
    expect(screen.getByRole('switch')).toBeChecked()

    await userEvent.click(screen.getByRole('switch'))
    expect(root.hasAttribute('data-black')).toBe(false)
    expect(window.localStorage.getItem(BLACK_STORAGE_KEY)).toBeNull()
    expect(root.style.getPropertyValue(chromeProperty.dark)).toBe('')
  })
})
