import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { ColorwayPicker } from './colorway-picker'
import { COLORS_STORAGE_KEY } from './theme'

const root = document.documentElement

function Section() {
  return (
    <>
      <h2 id="colors-title">Colors</h2>
      <p id="colors-body">What it changes</p>
      <ColorwayPicker labelledBy="colors-title" describedBy="colors-body" />
    </>
  )
}

describe('ColorwayPicker', () => {
  afterEach(() => {
    delete root.dataset.colors
  })

  it("offers every preset by name, with Shelf's own chosen", () => {
    renderWithIntl(<Section />)

    const group = screen.getByRole('radiogroup', { name: 'Colors' })
    expect(group).toHaveAccessibleDescription('What it changes')
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(screen.getByRole('radio', { name: 'Violet' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ocean' })).toHaveAccessibleDescription(
      'Blue, with cyan light',
    )
  })

  it('paints the page in the colorway chosen, and remembers it', async () => {
    renderWithIntl(<Section />)

    await userEvent.click(screen.getByRole('radio', { name: 'Arcade' }))

    expect(root.dataset.colors).toBe('arcade')
    expect(window.localStorage.getItem(COLORS_STORAGE_KEY)).toBe('arcade')
    expect(screen.getByRole('radio', { name: 'Arcade' })).toBeChecked()
  })

  it('shows the colorway the page is already painted in', () => {
    root.dataset.colors = 'graphite'
    renderWithIntl(<Section />)

    expect(screen.getByRole('radio', { name: 'Graphite' })).toBeChecked()
  })

  it('draws each card in its own colorway', () => {
    const { container } = renderWithIntl(<Section />)

    const painted = [...container.querySelectorAll('[data-colors]')].map(
      (element) => (element as HTMLElement).dataset.colors,
    )
    expect(painted).toEqual(['violet', 'ocean', 'ember', 'arcade', 'crimson', 'graphite'])
  })
})
