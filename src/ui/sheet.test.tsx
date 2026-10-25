import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Sheet, SheetContent } from './sheet'

/** An open sheet, and beside it a notice and the page, as the library has them. */
const page = async (onOpenChange: (open: boolean) => void) => {
  render(
    <>
      <p>The shelf</p>
      <div data-notice="">
        <button type="button">Open</button>
      </div>
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent title="A game" closeLabel="Close" description="Its details">
          <p>Mine</p>
        </SheetContent>
      </Sheet>
    </>,
  )
  // The sheet listens for presses outside it from the next turn on.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// The open sheet makes the rest of the page take no pointer; a real press lands anyway.
const press = (element: Element) => userEvent.setup({ pointerEventsCheck: 0 }).click(element)

describe('SheetContent', () => {
  it('closes on a press outside it', async () => {
    const onOpenChange = vi.fn()
    await page(onOpenChange)
    await press(screen.getByText('The shelf'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open when a notice it raised is pressed', async () => {
    const onOpenChange = vi.fn()
    await page(onOpenChange)
    await press(screen.getByRole('button', { name: 'Open', hidden: true }))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
