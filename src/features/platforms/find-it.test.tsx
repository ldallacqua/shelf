import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { FindIt } from './find-it'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** IGDB searched by a title: while it answers, the results' shapes, and the button keeps its word. */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FindIt', () => {
  it('draws the results’ ghosts while it searches, then the results', async () => {
    let answer!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    )
    const { container } = renderWithIntl(<FindIt title="Hades" onPick={vi.fn()} busy={false} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Searching…')
    expect(status).toHaveClass('sr-only')
    expect(container.querySelector('.ghost')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()

    answer(Response.json({ results: [{ igdbId: 1, title: 'Hades', year: 2020, cover: null }] }))
    expect(await screen.findByText('2020')).toBeInTheDocument()
    expect(container.querySelector('.ghost')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  })
})
