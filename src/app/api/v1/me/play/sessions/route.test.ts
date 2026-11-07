import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAYED_EVENT, startSendingPlayed } from '@/features/desktop/send-played'
import { setBridgeForTests } from '@/features/desktop/tauri'
import type { Db } from '@/server/db/client'
import { playSessions } from '@/server/db/schema'
import { findEntryIdBySlug } from '@/server/library/store'
import { createTestDatabase, sampleLibraryId } from '@/test/database'

import { POST } from './route'

/**
 * What Shelf for Windows counted, the whole way (ADR 005, section 12): the app holds a session, the
 * page sends it, and the server keeps it. Every part is the real one but the app, which stands in
 * as the page sees it, and the network, which hands the request to the route.
 */

const signedIn = vi.hoisted(() => ({ db: undefined as unknown, id: '' }))

vi.mock('@/server/auth/account', async (actual) => ({
  ...(await actual<object>()),
  requireAccount: async () => ({
    id: signedIn.id,
    handle: 'sample',
    name: 'Sample',
    shelfPublic: true,
  }),
}))
vi.mock('@/server/db/client', async (actual) => ({
  ...(await actual<object>()),
  database: () => signedIn.db,
  databaseIsDurable: () => true,
}))
// Outside a request there are no cached pages to expire.
vi.mock('next/cache', async (actual) => ({
  ...(await actual<object>()),
  revalidateTag: () => undefined,
}))

type Held = {
  id: string
  game: { entry: string }
  startedAt: number
  endedAt: number
  seconds: number
  device?: string
}

let db: Db
let entryId: string
/** What the app holds: what it counted, until Shelf says it has it. */
let held: Held[]
/** Answers the network is to lose on their way back, and those it lost. */
let losing: number
let lost: number
let asked: number
let stop: (() => void) | undefined

const app = async (command: string, args?: Record<string, unknown>) => {
  if (command === 'play_sessions') return held
  if (command === 'play_sessions_kept') {
    const kept = args?.ids as string[]
    held = held.filter((session) => !kept.includes(session.id))
  }
  return undefined
}

const network = async (path: string, init: RequestInit) => {
  asked += 1
  const answer = await POST(
    new Request(`http://localhost${path}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    }),
  )
  if (losing > 0) {
    losing -= 1
    lost += 1
    throw new TypeError('The network went before the answer came back')
  }
  return answer
}

const secondsOf = async (id: string) => {
  const [row] = await db
    .select({ seconds: sql<number>`coalesce(sum(${playSessions.seconds}), 0)` })
    .from(playSessions)
    .where(eq(playSessions.entryId, id))
  return Number(row?.seconds)
}

beforeEach(async () => {
  db = await createTestDatabase('default')
  signedIn.db = db
  signedIn.id = await sampleLibraryId(db)
  entryId = (await findEntryIdBySlug(db, signedIn.id, 'donkey-kong-country'))!
  held = []
  losing = 0
  lost = 0
  asked = 0
  setBridgeForTests(app)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('fetch', network)
})

afterEach(() => {
  stop?.()
  stop = undefined
  setBridgeForTests(undefined)
  vi.unstubAllGlobals()
})

describe('a session on its way from the app to Shelf', () => {
  it('counts once when Shelf kept it but its answer was lost, and is sent again', async () => {
    const before = await secondsOf(entryId)
    held = [
      {
        id: '0b7e2c4a-9d1f-4a6b-8c3e-5f2a7d9b1e60',
        game: { entry: entryId },
        startedAt: 1_000,
        endedAt: 1_201_000,
        seconds: 600,
        device: '5d0c6a3e-2f4b-4c8d-9e1a-7b3f6d2c8a90',
      },
    ]
    losing = 1
    stop = startSendingPlayed()
    await vi.waitFor(() => expect(lost).toBe(1))
    await new Promise((done) => setTimeout(done))
    // Shelf has it, but the page never heard: the app holds on to it, and offers it again.
    expect(held).toHaveLength(1)
    expect(await secondsOf(entryId)).toBe(before + 600)

    window.dispatchEvent(new Event(PLAYED_EVENT))
    await vi.waitFor(() => expect(held).toEqual([]))
    expect(asked).toBe(2)
    expect(await secondsOf(entryId)).toBe(before + 600)
  })

  it('is sent the moment the app says its game closed', async () => {
    stop = startSendingPlayed()
    await new Promise((done) => setTimeout(done))
    expect(asked).toBe(0)
    held = [
      {
        id: '7c1f3e9a-2b4d-4e6f-8a1c-3d5e7f9b2a40',
        game: { entry: entryId },
        startedAt: 1_000,
        endedAt: 61_000,
        seconds: 45,
      },
    ]
    window.dispatchEvent(new Event(PLAYED_EVENT))
    await vi.waitFor(() => expect(held).toEqual([]))
    expect(asked).toBe(1)
  })
})
