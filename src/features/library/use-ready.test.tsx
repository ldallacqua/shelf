import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { launchersChanged, setBridgeForTests } from '@/features/desktop/tauri'

import { useReadySlugs } from './use-ready'

/**
 * Which of my games are ready to play here (spec 7.7): Shelf answers with my
 * games' entries and apps, and a stand-in for this computer with what it has.
 */

const games = [
  { slug: 'grim-dawn', entryId: 'e-grim', steam: ['219990'] },
  { slug: 'bloodborne', entryId: 'e-blood', steam: [] },
  { slug: 'hades', entryId: 'e-hades', steam: ['1145360'] },
]

const computer = { entries: [] as string[], steam: ['219990'], answers: true }
const invoke = vi.fn(async (command: string) => {
  if (command !== 'playable' || !computer.answers) throw 'Command playable not allowed'
  return { entries: computer.entries, steam: computer.steam }
})
const fetched = vi.fn(async () => Response.json({ games }))

beforeEach(() => {
  vi.clearAllMocks()
  computer.entries = []
  computer.steam = ['219990']
  computer.answers = true
  setBridgeForTests(invoke)
  vi.stubGlobal('fetch', fetched)
})

afterEach(() => {
  setBridgeForTests(undefined)
  vi.unstubAllGlobals()
})

const slugs = (set: ReadonlySet<string> | null | undefined) => (set ? [...set].sort() : set)

describe('the games ready to play here (spec 7.7)', () => {
  it('are the games with a file still there or an app on Steam installed, read again when a file is chosen', async () => {
    const { result } = renderHook(() => useReadySlugs(true, 7))
    await waitFor(() => expect(slugs(result.current)).toEqual(['grim-dawn']))
    expect(fetched).toHaveBeenCalledWith('/api/v1/me/play', { cache: 'no-store' })

    computer.entries = ['e-blood']
    act(() => launchersChanged())
    await waitFor(() => expect(slugs(result.current)).toEqual(['bloodborne', 'grim-dawn']))
  })

  it('are not asked for in a browser, nor on someone else’s shelf', () => {
    setBridgeForTests(null)
    expect(renderHook(() => useReadySlugs(true, 7)).result.current).toBeNull()
    setBridgeForTests(invoke)
    expect(renderHook(() => useReadySlugs(false, 7)).result.current).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
    expect(fetched).not.toHaveBeenCalled()
  })

  it('are not offered by an app from before Ready to play', async () => {
    computer.answers = false
    const { result } = renderHook(() => useReadySlugs(true, 7))
    await waitFor(() => expect(result.current).toBeNull())
  })
})
