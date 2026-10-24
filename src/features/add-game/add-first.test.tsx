import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ShelfProvider } from '@/features/library/shelf'
import { renderWithIntl } from '@/test/render'

import { AddFirstGame } from './add-first'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let mine = true
vi.mock('@/features/owner/account', () => ({ useIsMine: () => mine }))

/**
 * The empty shelf's two ways in (spec 3.10), on one's own shelf: a game by
 * hand, or a whole library from a platform, on the page that sets a new
 * shelf up. A visitor is offered neither.
 */

const onShelf = () =>
  renderWithIntl(
    <ShelfProvider
      shelf={{ handle: 'ana', name: 'Ana', public: true, files: { kind: 'public', key: 'k' } }}
    >
      <AddFirstGame />
    </ShelfProvider>,
  )

describe('AddFirstGame', () => {
  it('offers a game by hand, or the platforms on the page that sets a shelf up', () => {
    mine = true
    onShelf()
    expect(screen.getByRole('button', { name: 'Add your first game' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bring your games from a platform' })).toHaveAttribute(
      'href',
      '/en/account/start',
    )
  })

  it('offers a visitor nothing', () => {
    mine = false
    onShelf()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
