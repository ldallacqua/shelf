import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Completion } from '@/domain/library/remembered'

import { readRememberedHere, rememberArrangement } from './arrangement'
import { useArrival } from './use-arrival'

/**
 * A library opened from an address that names no arrangement takes the one this device
 * remembers, puts it into the address once, and lets the address decide from then on
 * (issue 149).
 */

type Props = { completion: Completion | undefined; named: boolean }

const arrive = (completion: Completion | undefined, named = false) => {
  const put = vi.fn()
  const hook = renderHook(({ completion, named }: Props) => useArrival(completion, named, put), {
    initialProps: { completion, named },
  })
  return { ...hook, put }
}

describe('arriving at a library (issue 149)', () => {
  afterEach(cleanup)

  it('takes what is remembered, and puts it into the address once', () => {
    const remembered = { view: 'wall', group: 'status', sort: '-title' } as const
    const { result, rerender, put } = arrive(remembered)
    expect(result.current).toBe(remembered)
    expect(put).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledWith(remembered)

    // The address now names it: the address decides, and nothing is put again.
    rerender({ completion: remembered, named: true })
    expect(result.current).toBeUndefined()
    expect(put).toHaveBeenCalledOnce()
  })

  it('leaves an address with no arrangement alone when nothing is remembered', () => {
    const { result, put } = arrive(undefined)
    expect(result.current).toBeUndefined()
    expect(put).not.toHaveBeenCalled()
  })

  it('does not come back for a step back to an address that named none', () => {
    const remembered = { view: 'list' } as const
    const { result, rerender, put } = arrive(remembered)
    rerender({ completion: remembered, named: true })
    // Back to the defaults, or the defaults chosen: they are what shows.
    rerender({ completion: remembered, named: false })
    expect(result.current).toBeUndefined()
    expect(put).toHaveBeenCalledOnce()
  })

  it('comes back with a new arrival', () => {
    const { result, rerender, put } = arrive({ view: 'list' })
    rerender({ completion: { view: 'list' }, named: true })
    const again = { view: 'wall', sort: 'random', seed: 'n3w' } as const
    rerender({ completion: again, named: false })
    expect(result.current).toBe(again)
    expect(put).toHaveBeenLastCalledWith(again)
  })
})

describe('the arrangement remembered on this device', () => {
  const clear = () => {
    document.cookie = 'shelf_arrangement=; Path=/; Max-Age=0'
  }
  beforeEach(clear)
  afterEach(clear)

  const sort = { key: 'title', descending: true } as const

  it('is remembered as a choice leaves the library, and read back', () => {
    expect(readRememberedHere()).toEqual({})
    rememberArrangement({ view: 'wall', group: 'status', sort }, { smart: false })
    expect(readRememberedHere()).toEqual({ view: 'wall', group: 'status', sort: '-title' })
  })

  it('forgets everything when the defaults are chosen', () => {
    rememberArrangement({ view: 'wall', group: 'status', sort }, { smart: false })
    rememberArrangement(
      { view: 'shelf', group: 'platform', sort: { key: 'title', descending: false } },
      { smart: false },
    )
    expect(readRememberedHere()).toEqual({})
    expect(document.cookie).not.toContain('shelf_arrangement')
  })

  it('takes only the view from a smart shelf', () => {
    rememberArrangement({ view: 'wall', group: 'status', sort }, { smart: false })
    rememberArrangement(
      { view: 'list', group: 'year', sort: { key: 'added', descending: true } },
      { smart: true },
    )
    expect(readRememberedHere()).toEqual({ view: 'list', group: 'status', sort: '-title' })
  })

  it('is nothing when cookies cannot be read, and a choice still does not throw', () => {
    const cookie = vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readRememberedHere()).toEqual({})
    expect(() =>
      rememberArrangement({ view: 'wall', group: 'status', sort }, { smart: false }),
    ).not.toThrow()
    cookie.mockRestore()
    vi.restoreAllMocks()
  })
})
