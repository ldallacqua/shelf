import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { ConfirmInPlace } from './confirm'
import { Dialog, DialogContent } from './dialog'

/** An open dialog, and beside it a notice and the page, as the library has them. */
const page = async (onOpenChange: (open: boolean) => void) => {
  render(
    <>
      <p>The shelf</p>
      <div data-notice="">
        <button type="button">Open</button>
      </div>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent title="A game" closeLabel="Close" description="Its details">
          <p>Mine</p>
        </DialogContent>
      </Dialog>
    </>,
  )
  // The dialog listens for presses outside it from the next turn on.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// The open dialog makes the rest of the page take no pointer; a real press lands anyway.
const press = (element: Element) => userEvent.setup({ pointerEventsCheck: 0 }).click(element)

/** A dialog opened by a button that goes with what opened it, as a menu's item does. */
function Opener({ returning }: { returning: boolean }) {
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState(true)
  const stays = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button ref={stays}>Ways to play</Button>
      {item ? (
        <Button
          onClick={() => {
            setItem(false)
            setOpen(true)
          }}
        >
          Saves
        </Button>
      ) : null}
      <Button onClick={() => setOpen(true)}>Shortcuts</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Saves"
          closeLabel="Close"
          {...(returning ? { returnFocus: stays } : {})}
        >
          <ConfirmInPlace
            title="Restore them?"
            description="What is here is kept first."
            confirm="Restore"
            cancel="Cancel"
            onConfirm={() => undefined}
          >
            <Button>Restore</Button>
          </ConfirmInPlace>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('DialogContent', () => {
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

  it('is named by its title and starts with focus on its close button', async () => {
    await page(() => undefined)
    const dialog = screen.getByRole('dialog', { name: 'A game' })
    expect(dialog).toHaveAccessibleDescription('Its details')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('hands focus to the control given when what opened it has gone', async () => {
    const user = userEvent.setup()
    render(<Opener returning />)
    await user.click(screen.getByRole('button', { name: 'Saves' }))
    await screen.findByRole('dialog', { name: 'Saves' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ways to play' })).toHaveFocus()
  })

  it('hands focus back to what opened it, while that is still there', async () => {
    const user = userEvent.setup()
    render(<Opener returning={false} />)
    await user.click(screen.getByRole('button', { name: 'Shortcuts' }))
    await screen.findByRole('dialog', { name: 'Saves' })
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Shortcuts' })).toHaveFocus()
  })
})

describe('ConfirmInPlace', () => {
  it('asks inside the dialog, and Escape answers it without closing the dialog', async () => {
    const user = userEvent.setup()
    render(<Opener returning />)
    await user.click(screen.getByRole('button', { name: 'Shortcuts' }))
    const restore = await screen.findByRole('button', { name: 'Restore' })
    await user.click(restore)
    const question = screen.getByRole('group', { name: 'Restore them?' })
    expect(question).toHaveAccessibleDescription('What is here is kept first.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.keyboard('{Escape}')
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Saves' })).toBeInTheDocument()
    expect(restore).toHaveFocus()
  })

  it('goes ahead only once answered', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmInPlace
        title="Restore them?"
        description="What is here is kept first."
        confirm="Restore now"
        cancel="Cancel"
        onConfirm={onConfirm}
      >
        <Button>Restore</Button>
      </ConfirmInPlace>,
    )
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Restore' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Restore now' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group')).toBeNull()
  })
})
