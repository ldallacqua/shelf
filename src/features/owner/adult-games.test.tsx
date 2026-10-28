import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { ShortcutsDialog } from '@/features/filters/shortcuts-dialog'
import { preferenceScript } from '@/features/library/preferences'
import { renderWithIntl } from '@/test/render'

import { AdultGames } from './adult-games'

/**
 * Hiding adult games (spec 3.13): chosen on the account page, for this
 * device, so nothing beside the shelf shows that anything is hidden.
 */

const html = document.documentElement

describe('AdultGames', () => {
  afterEach(() => {
    window.localStorage.clear()
    html.removeAttribute('data-adult')
  })

  it('is off on a fresh browser, and says what it hides and where', () => {
    new Function(preferenceScript())()
    renderWithIntl(<AdultGames />)
    expect(screen.getByRole('heading', { name: 'Adult games' })).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Hide adult games on this device' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(/Erotic, and the ones the ESRB rates Adults Only/)
  })

  it('turned on, hides them in this browser from then on; turned off, shows them again', async () => {
    renderWithIntl(<AdultGames />)
    const toggle = screen.getByRole('switch')
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(window.localStorage.getItem('shelf:adult')).toBe('hidden')
    expect(html).toHaveAttribute('data-adult', 'hidden')

    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(window.localStorage.getItem('shelf:adult')).toBeNull()
    expect(html).toHaveAttribute('data-adult', 'shown')
  })

  it('shows what this browser already chose', () => {
    window.localStorage.setItem('shelf:adult', 'hidden')
    new Function(preferenceScript())()
    renderWithIntl(<AdultGames />)
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('is in Portuguese too', () => {
    renderWithIntl(<AdultGames />, 'pt-BR')
    expect(screen.getByRole('heading', { name: 'Jogos adultos' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Esconder jogos adultos neste aparelho' }),
    ).toBeInTheDocument()
  })
})

describe('the keyboard shortcuts list', () => {
  it('has no key for adult games: they are hidden from the account page only', () => {
    renderWithIntl(<ShortcutsDialog open onOpenChange={() => {}} experimental />)
    expect(screen.getByText('Next view')).toBeInTheDocument()
    expect(screen.queryByText(/adult games/i)).toBeNull()
  })
})
