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
      wanted: leaving ? [] : (patch.wanted ?? game.wanted),
    })
    return { ok: true as const, value: { version: 2 } }
  }),
  addCopy: vi.fn(),
  setFormat: vi.fn(),
  removeCopy: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
}))
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
