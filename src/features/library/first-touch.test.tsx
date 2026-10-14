import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pageTouched, resetTouch, whenTouched } from './first-touch'

describe('the first touch on the page', () => {
  afterEach(() => {
    resetTouch()
  })

  it('has not happened when the page opens', () => {
    expect(pageTouched()).toBe(false)
  })

  it.each([
    ['a tap or click', () => fireEvent.pointerDown(document.body)],
    ['a key', () => fireEvent.keyDown(document.body, { key: 'Tab' })],
    ['a wheel', () => fireEvent.wheel(document.body)],
    [
      'a scroll, of anything',
      () => fireEvent.scroll(document.body.appendChild(document.createElement('div'))),
    ],
    ['focus moving', () => fireEvent.focusIn(document.body)],
  ])('is %s, and tells every shelf waiting for it, once', (_, act) => {
    const first = vi.fn()
    const second = vi.fn()
    whenTouched(first)
    whenTouched(second)

    act()
    act()

    expect(pageTouched()).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not tell a shelf that stopped waiting', () => {
    const gone = vi.fn()
    const stop = whenTouched(gone)
    stop()
    fireEvent.pointerDown(document.body)
    expect(gone).not.toHaveBeenCalled()
  })

  it('is not listened for once it has happened', () => {
    fireEvent.pointerDown(document.body)
    const late = vi.fn()
    whenTouched(late)
    fireEvent.pointerDown(document.body)
    expect(late).not.toHaveBeenCalled()
    expect(pageTouched()).toBe(true)
  })
})
