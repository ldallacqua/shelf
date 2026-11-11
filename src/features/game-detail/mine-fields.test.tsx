import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'
import { MineFields } from './mine-fields'

let width = 800
let resize: () => void
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, width, 720),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver)
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.restoreAllMocks())

describe('the full personal record', () => {
  it('stays folded in one column and opens explicitly without hiding Play', async () => {
    width = 800
    renderWithIntl(
      <article className="game">
        <button type="button">Play fixture</button>
        <MineFields label="Edit your game">
          <input aria-label="Notes fixture" />
        </MineFields>
      </article>,
    )
    expect(screen.getByLabelText('Notes fixture')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Play fixture' })).toBeVisible()
    await userEvent.click(screen.getByText('Edit your game'))
    expect(screen.getByRole('textbox')).toBeVisible()
  })
  it('opens automatically beside a wide page and folds on stacking unless explicitly opened', () => {
    width = 1200
    renderWithIntl(
      <article className="game">
        <MineFields label="Edit your game">
          <input aria-label="Notes fixture" />
        </MineFields>
      </article>,
    )
    expect(screen.getByRole('textbox')).toBeVisible()
    width = 800
    act(() => resize())
    expect(screen.getByLabelText('Notes fixture')).not.toBeVisible()
  })
})
