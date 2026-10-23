import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScrub } from './scrub'

/** Scrubbing along a compact ledge (spec 3.4), on a ledge of three spines 40 pixels wide. */

const TITLES = ['Celeste', 'Hades', 'Tunic']

function Ledge({ onPick, enabled = true }: { onPick: (index: number) => void; enabled?: boolean }) {
  const list = useRef<HTMLUListElement>(null)
  const label = useRef<HTMLLIElement>(null)
  const [hot, setHot] = useState<number>()
  useScrub(list, label, { enabled, titleOf: (index) => TITLES[index], onHot: setHot, onPick })
  return (
    <ul ref={list} aria-label="Ledge">
      {TITLES.map((title, index) => (
        <li key={title}>
          <button type="button" data-index={index} data-active={hot === index ? 'true' : undefined}>
            {title}
          </button>
        </li>
      ))}
      <li ref={label} data-testid="title" hidden />
    </ul>
  )
}

/** The spine under a point: the ledge is a row, 40 pixels a spine. */
const at = (x: number) => screen.getAllByRole('button')[Math.floor(x / 40)] ?? null

const touch = (x: number, y = 20) => ({ touches: [{ clientX: x, clientY: y }] })

beforeEach(() => {
  vi.useFakeTimers()
  document.elementFromPoint = (x: number) => at(x)
})

afterEach(() => vi.useRealTimers())

describe('scrubbing a compact shelf', () => {
  it('tips out each spine the finger passes, titles it, and opens the one it lifts from', () => {
    const onPick = vi.fn()
    render(<Ledge onPick={onPick} />)
    const ledge = screen.getByRole('list')

    fireEvent.touchStart(ledge, touch(10))
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByRole('button', { name: 'Celeste' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('title')).toHaveTextContent('Celeste')
    expect(screen.getByTestId('title')).toBeVisible()

    fireEvent.touchMove(ledge, touch(90))
    expect(screen.getByRole('button', { name: 'Tunic' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: 'Celeste' })).not.toHaveAttribute('data-active')
    expect(screen.getByTestId('title')).toHaveTextContent('Tunic')

    fireEvent.touchMove(ledge, touch(50))
    fireEvent.touchEnd(ledge, { touches: [] })
    expect(onPick).toHaveBeenCalledWith(1)
    expect(screen.getByTestId('title')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Hades' })).not.toHaveAttribute('data-active')
  })

  it('stops the page from scrolling while it scrubs, and only then', () => {
    render(<Ledge onPick={vi.fn()} />)
    const ledge = screen.getByRole('list')
    fireEvent.touchStart(ledge, touch(10))
    act(() => vi.advanceTimersByTime(300))
    // fireEvent returns false when the event's default was prevented.
    expect(fireEvent.touchMove(ledge, touch(60))).toBe(false)
  })

  it('leaves a quick slide to scroll the page, and picks nothing', () => {
    const onPick = vi.fn()
    render(<Ledge onPick={onPick} />)
    const ledge = screen.getByRole('list')
    fireEvent.touchStart(ledge, touch(10))
    expect(fireEvent.touchMove(ledge, touch(80))).toBe(true)
    act(() => vi.advanceTimersByTime(300))
    fireEvent.touchEnd(ledge, { touches: [] })
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Celeste' })).not.toHaveAttribute('data-active')
  })

  it('does nothing on a shelf of covers, where boxes are wide enough to tap', () => {
    const onPick = vi.fn()
    render(<Ledge onPick={onPick} enabled={false} />)
    const ledge = screen.getByRole('list')
    fireEvent.touchStart(ledge, touch(10))
    act(() => vi.advanceTimersByTime(300))
    fireEvent.touchEnd(ledge, { touches: [] })
    expect(onPick).not.toHaveBeenCalled()
  })
})
