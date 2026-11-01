import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditPatch, OwnerGame } from '@/domain/library/editing'
import { today } from '@/features/owner/fields'
import { renderWithIntl } from '@/test/render'

import { MineEditor } from './mine-editor'

/**
 * Wishing for a game on one platform (spec 7.5): while it is on the
 * wishlist, "Want it on" takes the place of what I own, and leaving the
 * wishlist starts its first copy on the platform I wanted.
 */

const server = vi.hoisted(() => ({ games: new Map<string, OwnerGame>() }))
const client = vi.hoisted(() => ({
  read: vi.fn(async (slug: string) => ({ ok: true as const, value: server.games.get(slug)! })),
  update: vi.fn(async (entryId: string, patch: EditPatch) => {
    const [slug, game] = [...server.games].find(([, each]) => each.entryId === entryId)!
    const leaving = patch.status !== undefined && patch.status !== 'wishlist'
    server.games.set(slug, {
      ...game,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.completedOn ? { completedOn: patch.completedOn } : {}),
      ...(patch.private === undefined ? {} : { private: patch.private }),
      ...(patch.idle === undefined ? {} : { idle: patch.idle }),
      wanted: leaving ? [] : (patch.wanted ?? game.wanted),
      wantedStores: leaving ? [] : (patch.wantedStores ?? game.wantedStores ?? []),
    })
    return { ok: true as const, value: { version: 2 } }
  }),
  addCopy: vi.fn(
    async (entryId: string, copy: { platformId: number; format: 'physical' | 'digital' }) => {
      const [slug, game] = [...server.games].find(([, each]) => each.entryId === entryId)!
      server.games.set(slug, {
        ...game,
        copies: [...game.copies, { id: `copy-${game.copies.length}`, ...copy }],
      })
      return { ok: true as const, value: { version: 5 } }
    },
  ),
  setFormat: vi.fn(async (entryId: string, copyId: string, format: 'physical' | 'digital') => {
    const [slug, game] = [...server.games].find(([, each]) => each.entryId === entryId)!
    server.games.set(slug, {
      ...game,
      copies: game.copies.map((copy) => (copy.id === copyId ? { ...copy, format } : copy)),
    })
    return { ok: true as const, value: { version: 8 } }
  }),
  setStores: vi.fn(async () => ({ ok: true as const, value: { version: 7 } })),
  removeCopy: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  archive: vi.fn(async (entryId: string) => ({
    ok: true as const,
    value: { version: 3, entryId, title: 'Tsukihime: A Piece of Blue Glass Moon' },
  })),
  bringBack: vi.fn(),
  separate: vi.fn(async (entryId: string, gameId: string) => {
    const [slug, game] = [...server.games].find(([, each]) => each.entryId === entryId)!
    server.games.set(slug, {
      ...game,
      versions: game.versions.filter((version) => version.gameId !== gameId),
    })
    return {
      ok: true as const,
      value: { version: 4, slug: 'scholar', title: 'Dark Souls II: Scholar of the First Sin' },
    }
  }),
  sync: vi.fn(async () => ({ ok: true as const, value: { version: 6 } })),
}))
const notices = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@/features/shell/notices', () => notices)
vi.mock('./edit-client', () => ({ editClient: client }))
vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('@/features/library/shelf', () => ({ useShelf: () => ({ handle: 'sample' }) }))
vi.mock('@/features/owner/library-change', () => ({ announceChange: vi.fn() }))

const SWITCH = { id: 130, key: 'switch', name: 'Nintendo Switch', short: 'Switch' }
const PS4 = { id: 48, key: 'ps4', name: 'PlayStation 4', short: 'PS4' }

const wished = (slug: string, wanted: number[]): OwnerGame => ({
  entryId: `entry-${slug}`,
  slug,
  title: 'Tsukihime: A Piece of Blue Glass Moon',
  status: 'wishlist',
  wanted,
  private: false,
  notesPublic: false,
  tracked: 0,
  copies: [],
  tags: [],
  versions: [],
  platforms: [PS4, SWITCH],
})

const editor = (slug: string) =>
  renderWithIntl(<MineEditor slug={slug} level="h3" minor="h4" fallback={<p>Waiting</p>} />)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MineEditor, leaving the wishlist (spec 7.5)', () => {
  const owned = (slug: string): OwnerGame => ({ ...wished(slug, []), status: 'backlog' })

  it('asks Steam about the game once its new status is saved', async () => {
    server.games.set('bought', wished('bought', []))
    editor('bought')
    await userEvent.click(await screen.findByRole('radio', { name: 'Backlog' }))
    await waitFor(() => expect(client.sync).toHaveBeenCalledWith('entry-bought'))
    expect(client.update.mock.invocationCallOrder[0]).toBeLessThan(
      client.sync.mock.invocationCallOrder[0]!,
    )
  })

  it('shows what Steam found', async () => {
    server.games.set('bought', wished('bought', []))
    client.sync.mockImplementationOnce(async () => {
      server.games.set('bought', {
        ...server.games.get('bought')!,
        copies: [{ id: 'from-steam', platformId: PS4.id, format: 'digital' }],
      })
      return { ok: true as const, value: { version: 6 } }
    })
    editor('bought')
    await userEvent.click(await screen.findByRole('radio', { name: 'Backlog' }))
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(3))
    expect(await screen.findByText('PlayStation 4')).toBeInTheDocument()
  })

  it('says nothing when Steam could not be asked: what I chose is saved', async () => {
    server.games.set('offline', wished('offline', []))
    client.sync.mockRejectedValueOnce(new Error('The network went'))
    editor('offline')
    await userEvent.click(await screen.findByRole('radio', { name: 'Backlog' }))
    await waitFor(() => expect(client.sync).toHaveBeenCalled())
    expect(screen.getByRole('radio', { name: 'Backlog' })).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not ask for a change between statuses I own', async () => {
    server.games.set('kept', owned('kept'))
    editor('kept')
    await userEvent.click(await screen.findByRole('radio', { name: 'Completed' }))
    await waitFor(() => expect(client.update).toHaveBeenCalled())
    expect(client.sync).not.toHaveBeenCalled()
  })
})

describe('MineEditor, on the wishlist (spec 7.5)', () => {
  it('asks where I want it, in place of where I own it, and saves each choice at once', async () => {
    server.games.set('tsukihime', wished('tsukihime', []))
    editor('tsukihime')
    const wish = within(await screen.findByRole('group', { name: 'Want it on' }))
    expect(screen.queryByRole('group', { name: 'Owned on' })).not.toBeInTheDocument()

    await userEvent.click(wish.getByRole('checkbox', { name: 'Nintendo Switch' }))
    expect(client.update).toHaveBeenCalledWith('entry-tsukihime', { wanted: [130] })
    expect(wish.getByRole('checkbox', { name: 'Nintendo Switch' })).toBeChecked()
    expect(wish.getByRole('checkbox', { name: 'PlayStation 4' })).not.toBeChecked()
  })

  it('starts the first copy on the platform I wanted, once it leaves the wishlist', async () => {
    server.games.set('tsukihime-2', wished('tsukihime-2', [130]))
    editor('tsukihime-2')
    await screen.findByRole('group', { name: 'Want it on' })

    await userEvent.click(screen.getByRole('radio', { name: 'Backlog' }))
    expect(client.update).toHaveBeenCalledWith('entry-tsukihime-2', { status: 'backlog' })
    const owned = within(await screen.findByRole('group', { name: 'Owned on' }))
    expect(screen.queryByRole('group', { name: 'Want it on' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(owned.getByRole('combobox', { name: 'Platform' })).toHaveTextContent(
        'Nintendo Switch',
      ),
    )
  })
})

describe('MineEditor, archiving (spec 7.4)', () => {
  it('archives at once, asking nothing, and leaves the game', async () => {
    server.games.set('gift', wished('gift', []))
    const onRemoved = vi.fn()
    renderWithIntl(
      <MineEditor slug="gift" level="h3" minor="h4" onRemoved={onRemoved} fallback={null} />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    expect(client.archive).toHaveBeenCalledWith('entry-gift')
    expect(client.remove).not.toHaveBeenCalled()
    expect(onRemoved).toHaveBeenCalled()
  })

  it('offers archiving in the question removing asks', async () => {
    server.games.set('gift-2', wished('gift-2', []))
    editor('gift-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from library' }))
    const question = within(screen.getByRole('group', { name: 'Remove from library' }))
    expect(question.getByText(/Or archive it/)).toBeInTheDocument()
    await userEvent.click(question.getByRole('button', { name: 'Archive' }))
    expect(client.archive).toHaveBeenCalledWith('entry-gift-2')
    expect(client.remove).not.toHaveBeenCalled()
  })
})

describe('MineEditor, a game only I see (spec 11.1)', () => {
  it('makes it private at once, and back', async () => {
    server.games.set('secret', { ...wished('secret', []), status: 'backlog' })
    editor('secret')
    const toggle = await screen.findByRole('switch', { name: /^Private/ })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(client.update).toHaveBeenCalledWith('entry-secret', { private: true })
    await waitFor(() => expect(toggle).toBeChecked())
    await userEvent.click(toggle)
    expect(client.update).toHaveBeenLastCalledWith('entry-secret', { private: false })
  })
})

describe('MineEditor, separating a version (spec 7.6)', () => {
  it('asks first, then makes the version a game of its own and offers to open it', async () => {
    server.games.set('dark-souls-ii', {
      ...wished('dark-souls-ii', []),
      title: 'Dark Souls II',
      status: 'completed',
      versions: [
        {
          gameId: 'ds2',
          slug: 'dark-souls-ii',
          title: 'Dark Souls II',
          relation: 'primary',
          kind: 'main',
          platforms: [],
        },
        {
          gameId: 'scholar',
          slug: 'scholar',
          title: 'Dark Souls II: Scholar of the First Sin',
          relation: 'expanded',
          kind: 'main',
          platforms: [],
        },
      ],
    })
    editor('dark-souls-ii')
    await userEvent.click(await screen.findByRole('button', { name: 'Separate into its own game' }))
    expect(client.separate).not.toHaveBeenCalled()
    const question = within(screen.getByRole('group', { name: 'Separate into its own game' }))
    expect(question.getByText(/stay with Dark Souls II/)).toBeInTheDocument()

    await userEvent.click(question.getByRole('button', { name: 'Separate' }))
    expect(client.separate).toHaveBeenCalledWith('entry-dark-souls-ii', 'scholar')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Separate into its own game' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Dark Souls II: Scholar of the First Sin')).not.toBeInTheDocument()
    expect(notices.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dark Souls II: Scholar of the First Sin is a game of its own now, in Unsorted.',
        actions: [expect.objectContaining({ label: 'Open' })],
      }),
    )
  })

  it('keeps them together when I say so', async () => {
    server.games.set('ds2-again', {
      ...wished('ds2-again', []),
      versions: [
        { gameId: 'a', slug: 'a', title: 'A', relation: 'primary', kind: 'main', platforms: [] },
        { gameId: 'b', slug: 'b', title: 'B', relation: 'edition', kind: 'main', platforms: [] },
      ],
    })
    editor('ds2-again')
    await userEvent.click(await screen.findByRole('button', { name: 'Separate into its own game' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep together' }))
    expect(
      screen.queryByRole('group', { name: 'Separate into its own game' }),
    ).not.toBeInTheDocument()
    expect(client.separate).not.toHaveBeenCalled()
  })
})

describe('MineEditor, what I own and how long I played (spec 7.3)', () => {
  const owned = (slug: string): OwnerGame => ({
    ...wished(slug, []),
    status: 'backlog',
    tracked: 90,
    copies: [
      {
        id: 'ps4',
        platformId: 48,
        format: 'physical',
        synced: [{ source: 'steam', minutes: 600 }],
      },
    ],
  })

  it('shows each copy on its own card, and puts a new one together apart from them', async () => {
    server.games.set('pair', owned('pair'))
    editor('pair')
    const copies = within(await screen.findByRole('group', { name: 'Owned on' }))
    expect(copies.getByRole('listitem')).toHaveTextContent('PlayStation 4')
    expect(copies.getByRole('listitem')).toHaveTextContent('Steam: 10 h')
    expect(copies.queryByRole('group', { name: 'New copy' })).not.toBeInTheDocument()

    await userEvent.click(copies.getByRole('button', { name: 'Add a copy' }))
    const draft = within(copies.getByRole('group', { name: 'New copy' }))
    // PS4 physical is owned; on PS4 only digital is left.
    expect(draft.getByRole('combobox', { name: 'Platform' })).toHaveTextContent('PlayStation 4')
    expect(draft.getByRole('radio', { name: 'Physical' })).toBeDisabled()
    await userEvent.click(draft.getByRole('button', { name: 'Add' }))
    expect(client.addCopy).toHaveBeenCalledWith('entry-pair', { platformId: 48, format: 'digital' })
    expect(copies.queryByRole('group', { name: 'New copy' })).not.toBeInTheDocument()
    await waitFor(() => expect(copies.getAllByRole('listitem')).toHaveLength(2))
  })

  it('says the hours counted and where they come from, with nothing to type', async () => {
    server.games.set('hours', owned('hours'))
    editor('hours')
    expect(await screen.findByText('10 h')).toBeInTheDocument()
    expect(screen.getByText('Shelf for Windows: 1.5 h')).toBeInTheDocument()
    expect(screen.getAllByText('Steam: 10 h')).not.toHaveLength(0)
    expect(screen.getByText(/the larger of the two counts/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Hours played' })).not.toBeInTheDocument()
  })

  it('explains what counts, and that time away does not', async () => {
    server.games.set('how', owned('how'))
    editor('how')
    await userEvent.click(await screen.findByText('How hours are counted'))
    expect(screen.getByText(/After 5 minutes with no key, mouse or controller/)).toBeVisible()
    expect(screen.getByText(/also called AFK/)).toBeVisible()
  })

  it('says so when nothing has counted a game', async () => {
    server.games.set('none', {
      ...owned('none'),
      tracked: 0,
      copies: [{ id: 'ps4', platformId: 48, format: 'physical' }],
    })
    editor('none')
    expect(await screen.findByText('None counted yet')).toBeInTheDocument()
    expect(screen.queryByText(/Shelf for Windows:/)).not.toBeInTheDocument()
  })

  it('takes time left idle off what the stores report, once asked for', async () => {
    server.games.set('idle', owned('idle'))
    editor('idle')
    await screen.findByText('How hours are counted')
    expect(screen.queryByRole('textbox', { name: 'Time left idle' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Take out idle time' }))
    const idle = screen.getByRole('textbox', { name: 'Time left idle' })
    expect(idle).toHaveFocus()
    expect(screen.getByText(/never off what Shelf for Windows counted/)).toBeInTheDocument()
    await userEvent.type(idle, '4{Enter}')
    expect(client.update).toHaveBeenLastCalledWith('entry-idle', { idle: 240 })
    expect(await screen.findByText(/4 h of the stores’ time taken out as idle/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take out idle time' })).not.toBeInTheDocument()
  })

  it('shows the idle time taken out', async () => {
    server.games.set('taken', { ...owned('taken'), idle: 240 })
    editor('taken')
    expect(await screen.findByRole('textbox', { name: 'Time left idle' })).toHaveValue('4')
    expect(screen.queryByRole('button', { name: 'Take out idle time' })).not.toBeInTheDocument()
  })

  it('offers no idle time where no store reports hours', async () => {
    server.games.set('console', {
      ...owned('console'),
      copies: [{ id: 'ps4', platformId: 48, format: 'physical' }],
    })
    editor('console')
    await screen.findByText('How hours are counted')
    expect(screen.queryByRole('button', { name: 'Take out idle time' })).not.toBeInTheDocument()
  })

  it('marks a game completed on the day a platform last saw it played, and says so', async () => {
    server.games.set('finished', { ...owned('finished'), lastPlayedOn: '2024-03-10' })
    editor('finished')
    await userEvent.click(await screen.findByRole('radio', { name: 'Completed' }))
    expect(client.update).toHaveBeenCalledWith('entry-finished', {
      status: 'completed',
      completedOn: '2024-03-10',
    })
    const day = await screen.findByRole('button', { name: /Completed on/ })
    expect(day).toHaveTextContent('Mar 10, 2024')
    expect(day).toHaveAccessibleDescription(
      'Last played Mar 10, 2024. With no day chosen, that one counts.',
    )
  })

  it('marks one no platform saw played completed today', async () => {
    server.games.set('unplayed', owned('unplayed'))
    editor('unplayed')
    await userEvent.click(await screen.findByRole('radio', { name: 'Completed' }))
    expect(client.update).toHaveBeenCalledWith('entry-unplayed', {
      status: 'completed',
      completedOn: today(),
    })
    expect(screen.queryByText(/Last played/)).not.toBeInTheDocument()
  })
})

describe('MineEditor, Play in a browser (spec 7.7)', () => {
  const steamGame = (slug: string, steam?: OwnerGame['steam']): OwnerGame => ({
    ...wished(slug, []),
    status: 'playing',
    ...(steam ? { steam } : {}),
  })

  it('opens Steam on a game the Steam sync found I own', async () => {
    server.games.set('owned', steamGame('owned', { owned: '236430', known: ['236430', '335300'] }))
    editor('owned')
    const play = await screen.findByRole('link', { name: 'Play on Steam' })
    expect(play).toHaveAttribute('href', 'steam://rungameid/236430')
  })

  it('offers nothing for a game only IGDB lists on Steam, or none at all', async () => {
    server.games.set('listed', steamGame('listed', { known: ['219990'] }))
    server.games.set('none', steamGame('none'))
    editor('listed')
    await screen.findByRole('group', { name: 'Status' })
    expect(screen.queryByRole('link', { name: 'Play on Steam' })).not.toBeInTheDocument()
    editor('none')
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Status' })).toHaveLength(2))
    expect(screen.queryByRole('link', { name: 'Play on Steam' })).not.toBeInTheDocument()
  })
})

describe('MineEditor, where a PC game is from (spec 7.9)', () => {
  const PC = { id: 6, key: 'pc', name: 'PC', short: 'PC' }
  const ownedOnPc = (
    slug: string,
    format: 'digital' | 'physical',
    stores?: ('steam' | 'gog')[],
  ) => {
    const game: OwnerGame = {
      ...wished(slug, []),
      status: 'backlog',
      platforms: [PC, PS4],
      soldOn: ['steam', 'epic', 'playstation'],
      copies: [{ id: 'copy-pc', platformId: 6, format, ...(stores ? { stores } : {}) }],
    }
    server.games.set(slug, game)
    return game
  }
  const fields = () => screen.queryAllByRole('group', { name: 'Which store?' })

  it('asks which store a download on a PC is from, offering what it is sold on', async () => {
    ownedOnPc('download', 'digital', ['gog'])
    editor('download')
    const [field] = await screen.findAllByRole('group', { name: 'Which store?' })
    const names = within(field!)
      .getAllByRole('checkbox')
      .map((box) => box.parentElement?.textContent)
    // Sold on Steam and Epic, and mine on GOG; not PlayStation, which is no PC store.
    expect(names).toEqual(['Steam', 'GOG', 'Epic Games'])
    expect(within(field!).getByRole('checkbox', { name: 'GOG' })).toBeChecked()
    await userEvent.click(within(field!).getByRole('checkbox', { name: 'Steam' }))
    await waitFor(() =>
      expect(client.setStores).toHaveBeenCalledWith('entry-download', 'copy-pc', ['steam', 'gog']),
    )
  })

  it('shows the rest when asked, and hands them the focus', async () => {
    ownedOnPc('more', 'digital')
    editor('more')
    await userEvent.click(await screen.findByRole('button', { name: 'Another store' }))
    expect(screen.getByRole('checkbox', { name: 'Battle.net' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Another store' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'GOG' })).toHaveFocus()
  })

  it('does not ask of a disc, and stops asking when a download becomes one', async () => {
    ownedOnPc('disc', 'physical')
    editor('disc')
    await screen.findByRole('radio', { name: 'Backlog' })
    expect(fields()).toEqual([])
    await userEvent.click(screen.getByRole('radio', { name: 'Digital' }))
    expect(await screen.findByRole('group', { name: 'Which store?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Physical' }))
    await waitFor(() => expect(fields()).toEqual([]))
  })

  it('asks which store I would buy from, only while I want it on a PC', async () => {
    server.games.set('wish', {
      ...wished('wish', [48]),
      platforms: [PC, PS4],
      soldOn: ['steam', 'gog'],
    })
    editor('wish')
    await screen.findByRole('checkbox', { name: 'PC' })
    expect(fields()).toEqual([])
    await userEvent.click(screen.getByRole('checkbox', { name: 'PC' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'GOG' }))
    await waitFor(() =>
      expect(client.update).toHaveBeenCalledWith('entry-wish', { wantedStores: ['gog'] }),
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'PC' }))
    await waitFor(() => expect(fields()).toEqual([]))
  })

  it('starts the first copy as a download from the store I wanted, off the wishlist', async () => {
    server.games.set('bought', {
      ...wished('bought', [48, 6]),
      platforms: [PC, PS4],
      soldOn: ['steam', 'gog'],
      wantedStores: ['gog'],
    })
    editor('bought')
    await userEvent.click(await screen.findByRole('radio', { name: 'Backlog' }))
    const card = await screen.findByRole('group', { name: 'New copy' })
    expect(within(card).getByRole('checkbox', { name: 'GOG' })).toBeChecked()
    await userEvent.click(within(card).getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(client.addCopy).toHaveBeenCalledWith('entry-bought', {
        platformId: 6,
        format: 'digital',
        stores: ['gog'],
      }),
    )
  })
})
