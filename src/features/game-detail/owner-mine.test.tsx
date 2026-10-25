import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import { renderWithIntl } from '@/test/render'

import { MineSkeleton } from './mine-skeleton'
import { OwnerMine } from './owner-mine'

/**
 * "Mine" on a game's page (spec 7.3): the words for a visitor, the editor for
 * the shelf's own account, and the editor's shape in its place while it
 * comes, so nothing below it moves when it arrives.
 */

const account = vi.hoisted(() => ({
  status: 'visitor' as 'visitor' | 'checking' | 'signed-in',
  handle: 'sample',
}))
vi.mock('@/features/owner/account', () => ({ useAccount: () => ({ ...account }) }))
vi.mock('./mine-editor', () => ({ MineEditor: () => <p>The editor</p> }))

const ps4: LibraryPlatform = {
  id: 48,
  key: 'ps4',
  name: 'PlayStation 4',
  short: 'PS4',
  family: 'playstation',
  generation: 8,
  shape: 'bluRay',
  plastic: 'blue',
}
const platforms = new Map([[ps4.id, ps4]])

const game = (extra: Partial<LibraryGame> = {}): LibraryGame => ({
  slug: 'bloodborne',
  title: 'Bloodborne',
  status: 'playing',
  addedOn: '2023-11-23',
  minutes: 0,
  igdbRatingCount: 0,
  kind: 'main',
  featured: false,
  hasNotes: false,
  copies: [{ platform: 48, format: 'physical' }],
  genres: [],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [48],
  franchises: [],
  series: [],
  developers: [],
  publishers: [],
  tags: [],
  ...extra,
})

const mine = (entry = game()) => (
  <OwnerMine
    handle="sample"
    slug={entry.slug}
    level="h3"
    minor="h4"
    skeleton={<MineSkeleton game={entry} tags={[]} platforms={platforms} level="h3" />}
  >
    <p>What a visitor reads</p>
  </OwnerMine>
)

describe('OwnerMine', () => {
  it('gives a visitor the words alone, never the editor or its shape', () => {
    account.status = 'visitor'
    renderWithIntl(mine())
    expect(screen.getByText('What a visitor reads')).toBeInTheDocument()
    expect(document.querySelector('[data-mine-skeleton]')).toBeNull()
  })

  it('gives another account the words alone, on a shelf that is not theirs (ADR 004)', () => {
    account.status = 'signed-in'
    account.handle = 'someone-else'
    renderWithIntl(mine())
    expect(screen.getByText('What a visitor reads')).toBeInTheDocument()
    expect(screen.queryByText('The editor')).not.toBeInTheDocument()
    expect(document.querySelector('[data-mine-skeleton]')).toBeNull()
    account.handle = 'sample'
  })

  it('holds the editor’s place while the browser asks who is here', () => {
    account.status = 'checking'
    renderWithIntl(mine())
    expect(screen.queryByText('What a visitor reads')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mine' })).toBeInTheDocument()
    expect(document.querySelector('[data-mine-skeleton]')).not.toBeNull()
  })

  it('gives the shelf’s own account the editor, its shape standing in until it comes', async () => {
    account.status = 'signed-in'
    renderWithIntl(mine())
    expect(document.querySelector('[data-mine-skeleton]')).not.toBeNull()
    expect(await screen.findByText('The editor')).toBeInTheDocument()
    expect(document.querySelector('[data-mine-skeleton]')).toBeNull()
  })
})

describe('MineSkeleton', () => {
  const shape = (entry: LibraryGame) =>
    renderWithIntl(<MineSkeleton game={entry} tags={[]} platforms={platforms} level="h3" />)

  it('has the editor’s labels where the editor has them, and nothing to press or read out', () => {
    shape(game())
    for (const label of ['Status', 'My rating', 'Hours played', 'Owned on', 'Tags', 'Notes']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('is shaped by what the library knows: a completion date, a copy that could be added', () => {
    shape(game())
    expect(screen.queryByText('Completed on')).not.toBeInTheDocument()
    expect(screen.getByText('Add a copy')).toBeInTheDocument()

    shape(
      game({
        slug: 'sekiro',
        status: 'completed',
        completedOn: '2024-02-01',
        copies: [
          { platform: 48, format: 'physical' },
          { platform: 48, format: 'digital' },
        ],
      }),
    )
    expect(screen.getByText('Completed on')).toBeInTheDocument()
    expect(screen.getAllByText('Add a copy')).toHaveLength(1)
  })

  it('on the wishlist, holds the place of where I want it, not where I own it (spec 7.5)', () => {
    shape(game({ slug: 'tsukihime', status: 'wishlist', copies: [], wanted: [48] }))
    expect(screen.getByText('Want it on')).toBeInTheDocument()
    expect(screen.getByText('PlayStation 4')).toBeInTheDocument()
    expect(screen.queryByText('Owned on')).not.toBeInTheDocument()
    expect(screen.queryByText('Add a copy')).not.toBeInTheDocument()
  })
})
