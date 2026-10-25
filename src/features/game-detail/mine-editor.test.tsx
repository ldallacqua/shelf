import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditPatch, OwnerGame } from '@/domain/library/editing'
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
      ...(patch.private === undefined ? {} : { private: patch.private }),
      wanted: leaving ? [] : (patch.wanted ?? game.wanted),
    })
    return { ok: true as const, value: { version: 2 } }
  }),
  addCopy: vi.fn(),
  setFormat: vi.fn(),
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
  minutes: 0,
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
    const toggle = await screen.findByRole('switch', { name: 'Private: only you see this game' })
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
    expect(screen.queryByRole('group', { name: 'Separate into its own game' })).not.toBeInTheDocument()
    expect(client.separate).not.toHaveBeenCalled()
  })
})
