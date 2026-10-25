import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ShelfProvider, useShelf } from '@/features/library/shelf'
import { renderWithIntl } from '@/test/render'

import { GameMissing } from './game-missing'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const account = vi.hoisted(() => ({
  status: 'visitor' as 'visitor' | 'checking' | 'signed-in',
  handle: 'ana',
}))
vi.mock('@/features/owner/account', () => ({
  useAccount: () => ({ ...account }),
  useIsMine: (handle: string | undefined) =>
    account.status === 'signed-in' && account.handle === handle,
}))
vi.mock('./private-game-later', () => ({
  PrivateGameLater: ({ slug }: { slug: string }) => {
    const { files } = useShelf()
    return (
      <p>{`Your game ${slug}, from ${files.kind === 'mine' ? 'your own files' : 'the public file'}`}</p>
    )
  },
}))

/**
 * A game only its own account sees (spec 11.1), at its own address on a
 * public shelf: to anyone else there is no such game; to its account, the
 * game, from its own files.
 */

const page = () =>
  renderWithIntl(
    <ShelfProvider
      shelf={{ handle: 'ana', name: 'Ana', public: true, files: { kind: 'public', key: 'k' } }}
    >
      <GameMissing slug="hades" />
    </ShelfProvider>,
  )

describe('a game the public shelf has no page for', () => {
  it('is not found, to a visitor', () => {
    account.status = 'visitor'
    page()
    expect(screen.queryByText(/Your game/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /library|shelf/i })).toBeInTheDocument()
  })

  it('is shown to its own account, from its own files', () => {
    account.status = 'signed-in'
    page()
    expect(screen.getByText('Your game hades, from your own files')).toBeInTheDocument()
  })

  it('is not found, to another account', () => {
    account.status = 'signed-in'
    account.handle = 'someone-else'
    page()
    expect(screen.queryByText(/Your game/)).not.toBeInTheDocument()
    account.handle = 'ana'
  })
})
