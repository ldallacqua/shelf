import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { preferenceScript } from '@/features/library/preferences'
import { messages, renderWithIntl } from '@/test/render'

import { FILTERS_ID } from './filter-panel'
import { FiltersToggle } from './filters-toggle'

const html = document.documentElement

afterEach(() => {
  html.removeAttribute('data-library-filters')
  html.removeAttribute('data-game-list')
  window.localStorage.clear()
})

describe('the button that hides the filters beside the library', () => {
  it('hides the column and brings it back with the same focused button, and remembers the choice', async () => {
    renderWithIntl(<FiltersToggle count={0} />)
    const button = screen.getByRole('button', { name: 'Hide filters' })
    expect(button).toHaveAttribute('aria-controls', FILTERS_ID)
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(button)
    expect(screen.getByRole('button', { name: 'Show filters' })).toBe(button)
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(html).toHaveAttribute('data-library-filters', 'hidden')
    expect(window.localStorage.getItem('shelf:library-filters')).toBe('hidden')
    // Only the filters: the list beside a game is a choice of its own.
    expect(html).not.toHaveAttribute('data-game-list')

    // The next page has it before its first paint.
    html.removeAttribute('data-library-filters')
    new Function(preferenceScript())()
    expect(html).toHaveAttribute('data-library-filters', 'hidden')

    await userEvent.click(button)
    expect(button).toHaveAccessibleName('Hide filters')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem('shelf:library-filters')).toBeNull()
  })

  it('hidden, counts the conditions on, as the Filters button does where there is no column', async () => {
    renderWithIntl(<FiltersToggle count={2} />, 'pt-BR')
    const button = screen.getByRole('button', { name: 'Esconder filtros' })
    // Shown, the column says what is on.
    expect(button).not.toHaveTextContent('2')

    await userEvent.click(button)
    expect(button).toHaveAccessibleName('Mostrar filtros, 2 ativos')
    expect(button.querySelector('[aria-hidden="true"].rounded-full')).toHaveTextContent('2')
  })

  it('built ahead, holds both its words, for the choice on <html> to pick before the first paint', () => {
    const page = renderToString(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        <FiltersToggle count={0} />
      </NextIntlClientProvider>,
    )
    const button = document.createElement('div')
    button.innerHTML = page
    // Neither open nor closed is said before it is known.
    expect(button.querySelector('button')).not.toHaveAttribute('aria-expanded')
    const [hide, show] = button.querySelectorAll('button > span')
    expect(hide).toHaveTextContent('Hide filters')
    expect(hide).toHaveClass('filters-hidden:hidden')
    expect(show).toHaveTextContent('Show filters')
    expect(show).toHaveClass('hidden', 'filters-hidden:inline-flex')
  })
})
