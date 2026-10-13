import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReadyMark } from './ready-mark'

describe('ReadyMark', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks the page as live two frames after it mounts, not sooner', () => {
    render(<ReadyMark />)
    expect(document.documentElement.dataset.ready).toBeUndefined()

    vi.advanceTimersToNextFrame()
    expect(document.documentElement.dataset.ready).toBeUndefined()

    vi.advanceTimersToNextFrame()
    expect(document.documentElement.dataset.ready).toBe('true')
  })

  it('does nothing if it is removed before the two frames pass', () => {
    const { unmount } = render(<ReadyMark />)
    unmount()

    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(document.documentElement.dataset.ready).toBeUndefined()
  })
})
