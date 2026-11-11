import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIBRARY_FILE_REVISION } from '@/domain/library/file-address'
import { emptyLibrary } from '@/domain/library/library'
import { encodeLibrary } from '@/domain/library/snapshot'

import { snapshotAddress } from './shelf-address'
import { load } from './use-library'

/**
 * The library file after a change (spec 7.3): right after a write the server
 * may still send the new version's address on to the one before it, while it
 * makes the new file. The page asks again rather than show the shelf as it
 * was before the change.
 */

const file = (version: number) => Response.json(encodeLibrary(emptyLibrary(version)))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('loading the library file', () => {
  it('asks again while the server still hands back the version before the one asked for', async () => {
    vi.useFakeTimers()
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(file(41))
      .mockResolvedValueOnce(file(41))
      .mockResolvedValueOnce(file(42))
    const library = load({ kind: 'public', key: 'again' }, 42)
    await vi.runAllTimersAsync()
    expect((await library).version).toBe(42)
    expect(fetched).toHaveBeenCalledTimes(3)
    expect(String(fetched.mock.calls[0]?.[0])).toBe(
      `/api/v1/libraries/again/snapshot/42?revision=${LIBRARY_FILE_REVISION}`,
    )
  })

  it('asks for the file’s revision, so a browser holding a copy made before asks again', () => {
    // A copy kept from before IGDB's small covers were carried would draw Steam's in a list's rows.
    expect(LIBRARY_FILE_REVISION).toBeGreaterThanOrEqual(2)
    expect(snapshotAddress({ kind: 'public', key: 'k' }, 7)).toBe(
      `/api/v1/libraries/k/snapshot/7?revision=${LIBRARY_FILE_REVISION}`,
    )
    expect(snapshotAddress({ kind: 'mine' }, 7)).toBe('/api/v1/me/library')
  })

  it('takes what it is given in the end, rather than never drawing', async () => {
    vi.useFakeTimers()
    const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => file(9))
    const library = load({ kind: 'public', key: 'stale' }, 10)
    await vi.runAllTimersAsync()
    expect((await library).version).toBe(9)
    expect(fetched).toHaveBeenCalledTimes(5)
  })

  it('takes the version asked for at once', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(file(7))
    expect((await load({ kind: 'public', key: 'now' }, 7)).version).toBe(7)
    expect(fetched).toHaveBeenCalledTimes(1)
  })
})
