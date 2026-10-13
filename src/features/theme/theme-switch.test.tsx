import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { THEME_STORAGE_KEY } from './theme'
import { ThemePicker } from './theme-picker'
import { ThemeSwitch } from './theme-switch'

const root = document.documentElement

describe('ThemeSwitch', () => {
  it('offers the three choices, with the current one checked', async () => {
    renderWithIntl(<ThemeSwitch />)

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitemradio', { name: 'System' })).toBeChecked()
    expect(within(menu).getByRole('menuitemradio', { name: 'Light' })).not.toBeChecked()
    expect(within(menu).getByRole('menuitemradio', { name: 'Dark' })).not.toBeChecked()
  })

  it('applies and remembers a choice', async () => {
    renderWithIntl(<ThemeSwitch />)

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(root.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  })

  it('works from the keyboard alone, and returns focus to its button', async () => {
    renderWithIntl(<ThemeSwitch />)
    const button = screen.getByRole('button', { name: 'Theme' })

    await userEvent.tab()
    expect(button).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(root.dataset.theme).toBe('dark')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes on Escape without changing anything', async () => {
    renderWithIntl(<ThemeSwitch />)

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(root.dataset.themeChoice).toBe('system')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('is labeled in Portuguese on a Portuguese page', async () => {
    renderWithIntl(<ThemeSwitch />, 'pt-BR')

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }))

    expect(screen.getByRole('menuitemradio', { name: 'Sistema' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Escuro' })).toBeInTheDocument()
  })
})

describe('ThemePicker', () => {
  it('shows the three choices in a row and applies the one picked', async () => {
    renderWithIntl(<ThemePicker />)

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(root.dataset.theme).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
  })

  it('stays in step with the header switch', async () => {
    renderWithIntl(
      <>
        <ThemeSwitch />
        <ThemePicker />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }))

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  })
})
