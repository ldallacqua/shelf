import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { testGame, testLibrary } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'
import { renderWithIntl } from '@/test/render'

import { TrophyWallView } from './trophy-wall'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** A public trophy page ends with its card (issue 68), and the ways to share its link. */

const library = testLibrary([testGame('Hades', { status: 'completed', completedOn: '2025-03-02' })])
const card = {
  src: '/api/v1/libraries/k/trophies/card?locale=en&year=2025',
  alt: "Ana's 2025 in games",
}

const draw = (shown = card) =>
  renderWithIntl(
    <TrophyWallView
      wall={trophyWall(library, 2026, 'en', { scope: 2025 })}
      handle="ana"
      card={shown}
    />,
    'en',
  )

afterEach(() => vi.unstubAllGlobals())

describe('sharing the trophy page (issue 68)', () => {
  it('shows the card a link shows, to save as it is', () => {
    draw()
    const share = screen.getByRole('region', { name: 'Share 2025' })
    expect(screen.getByRole('img', { name: "Ana's 2025 in games" })).toHaveAttribute(
      'src',
      card.src,
    )
    const save = screen.getByRole('link', { name: 'Save the card' })
    expect(save).toHaveAttribute('href', card.src)
    expect(save).toHaveAttribute('download', 'trophies-2025.png')
    expect(share).toHaveTextContent('A link to this page shows this card wherever it is shared.')
  })

  it('copies the page’s link where the device has no sharing of its own, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    draw()
    await userEvent.click(screen.getByRole('button', { name: 'Copy the link' }))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  })

  it('hands the link to the device’s sharing where it has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    draw()
    await userEvent.click(screen.getByRole('button', { name: 'Share the link' }))
    expect(share).toHaveBeenCalledWith({ title: document.title, url: window.location.href })
  })

  it('is not offered without a card: a private shelf’s, or a filtered page', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026, 'en')} handle="ana" />, 'en')
    expect(screen.queryByRole('link', { name: 'Save the card' })).toBeNull()
  })
})
