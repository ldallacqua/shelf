import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { ColorwayPicker } from './colorway-picker'
import { presets } from '@/domain/colorway/presets'

import { getOwnColorway } from './colorway-store'
import { COLORS_STORAGE_KEY, OWN_COLORS_STORAGE_KEY } from './theme'

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
    root.removeAttribute('style')
    window.localStorage.removeItem(OWN_COLORS_STORAGE_KEY)
  })

  it("offers every preset by name, with Shelf's own chosen", () => {
    renderWithIntl(<Section />)

    const group = screen.getByRole('radiogroup', { name: 'Colors' })
    expect(group).toHaveAccessibleDescription('What it changes')
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(screen.getByRole('radio', { name: 'Your own' })).toHaveAccessibleDescription(
      'Three colors you pick',
    )
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
    expect(painted).toEqual(['violet', 'ocean', 'ember', 'arcade', 'crimson', 'graphite', 'own'])
  })

  it("makes one's own from the colorway on screen, and opens its three colors", async () => {
    root.dataset.colors = 'ember'
    renderWithIntl(<Section />)

    expect(screen.queryByRole('region', { name: 'Your colors' })).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Your own' }))

    expect(root.dataset.colors).toBe('own')
    expect(getOwnColorway()).toMatchObject({ seeds: presets.ember, from: 'ember' })
    const editor = screen.getByRole('region', { name: 'Your colors' })
    expect(within(editor).getByLabelText('Accent')).toHaveValue(presets.ember.accent)
    expect(within(editor).getByLabelText('Room')).toHaveAccessibleDescription(
      'A tint for the walls, the shelves and the text',
    )
    expect(within(editor).getByLabelText('Light')).toHaveValue(presets.ember.led)
  })

  it('repaints the page as a color is picked, and starts again from its preset', async () => {
    root.dataset.colors = 'ocean'
    renderWithIntl(<Section />)
    await userEvent.click(screen.getByRole('radio', { name: 'Your own' }))
    const before = root.style.getPropertyValue('--own-light-accent')

    fireEvent.input(screen.getByLabelText('Accent'), { target: { value: '#e5223a' } })

    await waitFor(() => expect(getOwnColorway()?.seeds.accent).toBe('#e5223a'))
    expect(root.style.getPropertyValue('--own-light-accent')).not.toBe(before)
    expect(screen.getByLabelText('Accent')).toHaveValue('#e5223a')

    await userEvent.click(screen.getByRole('button', { name: 'Start again from Ocean' }))
    expect(getOwnColorway()?.seeds).toEqual(presets.ocean)
  })

  it("comes back to one's own as it was left", async () => {
    renderWithIntl(<Section />)
    await userEvent.click(screen.getByRole('radio', { name: 'Your own' }))
    fireEvent.input(screen.getByLabelText('Room'), { target: { value: '#2c4a66' } })
    await waitFor(() => expect(getOwnColorway()?.seeds.room).toBe('#2c4a66'))

    await userEvent.click(screen.getByRole('radio', { name: 'Crimson' }))
    expect(screen.queryByRole('region', { name: 'Your colors' })).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Your own' }))

    expect(getOwnColorway()?.seeds.room).toBe('#2c4a66')
    expect(screen.getByLabelText('Room')).toHaveValue('#2c4a66')
  })
})
