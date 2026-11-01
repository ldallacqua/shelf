import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { GameImage } from '@/domain/igdb/game'
import { renderWithIntl } from '@/test/render'

import { Screenshots } from './screenshots'

/**
 * Screenshots Steam keeps for adults (ADR 006): blurred, with an eye and "+18",
 * until pressed, and out of the viewer until then.
 */

const shot = (name: string, mature?: true): GameImage => ({
  id: `steam/apps/2000002/ss_${name}.jpg`,
  width: 1920,
  height: 1080,
  ...(mature ? { mature } : {}),
})

const SHOTS = [shot('aa'), shot('bb', true), shot('cc', true)]

const thumbs = () =>
  within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-adult'))

describe('Screenshots, with some for adults', () => {
  it('blurs those, and says what pressing one does', () => {
    renderWithIntl(<Screenshots shots={SHOTS} title="A Game" />)
    expect(thumbs()).toEqual([null, 'hidden', 'hidden'])
    const hidden = screen.getByRole('button', { name: /Screenshot 2 of 3 .*for adults, blurred/ })
    expect(hidden).toHaveTextContent('+18')
  })

  it('never draws one of them in the viewer before I say', async () => {
    renderWithIntl(<Screenshots shots={SHOTS} title="A Game" />)
    await userEvent.click(screen.getByRole('button', { name: /Screenshot 1 of 3/ }))
    const viewer = screen.getByRole('dialog')
    expect(within(viewer).getByText(/1.*1/)).toBeInTheDocument()
    expect(viewer.querySelectorAll('img')).toHaveLength(1)
    expect(viewer.innerHTML).not.toContain('ss_bb')
  })

  it('shows them all once one is pressed, still marked, without opening anything', async () => {
    renderWithIntl(<Screenshots shots={SHOTS} title="A Game" />)
    await userEvent.click(screen.getByRole('button', { name: /Screenshot 2 of 3 .*blurred/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(thumbs()).toEqual([null, 'shown', 'shown'])
    expect(screen.getAllByText('+18')).toHaveLength(2)
  })

  it('then opens the one pressed, with the rest beside it', async () => {
    renderWithIntl(<Screenshots shots={SHOTS} title="A Game" />)
    await userEvent.click(screen.getByRole('button', { name: /Screenshot 2 of 3 .*blurred/ }))
    await userEvent.click(screen.getByRole('button', { name: /Screenshot 3 of 3.*full screen/ }))
    const viewer = screen.getByRole('dialog')
    expect(viewer.querySelectorAll('img')).toHaveLength(3)
    expect(within(viewer).getByText(/3.*3/)).toBeInTheDocument()
  })

  it('asks again of the next game the panel steps to', async () => {
    function Stepping() {
      const [title, setTitle] = useState('A Game')
      return (
        <>
          <Screenshots shots={SHOTS} title={title} />
          <span onClick={() => setTitle('Another Game')}>next game</span>
        </>
      )
    }
    renderWithIntl(<Stepping />)
    await userEvent.click(screen.getByRole('button', { name: /Screenshot 2 of 3 .*blurred/ }))
    await userEvent.click(screen.getByText('next game'))
    expect(thumbs()).toEqual([null, 'hidden', 'hidden'])
  })

  it('marks nothing on a game with none', () => {
    renderWithIntl(<Screenshots shots={[shot('aa')]} title="A Game" />)
    expect(thumbs()).toEqual([null])
    expect(screen.queryByText('+18')).not.toBeInTheDocument()
  })
})
