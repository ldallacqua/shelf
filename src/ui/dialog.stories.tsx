import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EllipsisIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Button } from './button'
import { ConfirmInPlace } from './confirm'
import { Dialog, DialogContent, DialogTrigger } from './dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Input } from './field'

/**
 * The one dialog (ADR 009, decision 3). Primer's guidance is the model: centered with a margin of the
 * page all round, a title and a close button that are always there, a body that scrolls between a fixed
 * header and footer, and on a phone the whole screen, as a dialog with a field should be there, risen
 * from the bottom. Apple's sheets add the rule that one shows at a time: a question inside one is asked
 * in place. Made-up content.
 */
const meta = {
  title: 'UI/Dialog',
  component: DialogContent,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DialogContent>

export default meta
type Story = StoryObj

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <p key={index} className="text-sm text-pretty text-muted">
      Line {index + 1} of something long enough to scroll: the body scrolls, while the title, the
      close button and the footer stay where they are.
    </p>
  ))

/** A dialog open from the start, beside the button that opens it again. */
function Opened({
  label = 'Open',
  children,
  ...content
}: Partial<React.ComponentProps<typeof DialogContent>> & { label?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{label}</Button>
      </DialogTrigger>
      <DialogContent title="Made-up dialog" closeLabel="Close" {...content}>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** A little to say: it is as tall as that, in the middle of the window. */
export const Short: Story = {
  render: () => (
    <Opened description="A short dialog">
      <p className="text-sm text-pretty">One sentence, and nothing more to do than read it.</p>
    </Opened>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Made-up dialog' })
    // Focus starts on the close button, at the top, so nothing scrolls away.
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
  },
}

/** More than fits: the body scrolls between the title and the footer. */
export const Long: Story = {
  render: () => (
    <Opened
      footer={
        <>
          <p className="text-sm">40 lines</p>
          <Button variant="primary" size="sm">
            Done
          </Button>
        </>
      }
    >
      <div className="grid gap-3">{lines(40)}</div>
    </Opened>
  ),
}

function Form() {
  const [open, setOpen] = useState(true)
  const nameId = useId()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Name it</Button>
      </DialogTrigger>
      <DialogContent title="Save as a shelf" closeLabel="Close" size="sm">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <Input id={nameId} required autoComplete="off" />
          </div>
          <div>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A form, at its narrower width. Tab stays inside, from the close button to Save and round again. */
export const WithAForm: Story = {
  render: () => <Form />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Save as a shelf' })
    await userEvent.tab()
    await expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await userEvent.tab()
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus()
    await userEvent.tab()
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
  },
}

/** Words that won't break and a long title stay inside it, wrapped. */
export const Overflowing: Story = {
  render: () => (
    <Opened
      title="A made-up game whose name is long enough to need two lines in a dialog"
      size="sm"
    >
      <p className="text-sm break-all">
        C:\Users\Someone\AppData\Roaming\Made-up Studio\Made-up
        Game\saves\profile-0001\slot-0001.sav
      </p>
    </Opened>
  ),
}

/** On a phone it is the whole screen, risen from the bottom, a keyboard's room included. */
export const OnAPhone: Story = {
  render: () => <Form />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

/** On a phone, more than fits. */
export const LongOnAPhone: Story = {
  render: () => <Opened>{lines(30)}</Opened>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

function FromAMenu() {
  const [open, setOpen] = useState(false)
  const more = useRef<HTMLButtonElement>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={more} variant="ghost" size="sm" className="px-2" aria-label="More">
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          // Focus goes to what just opened, not back to this button.
          onCloseAutoFocus={(event) => {
            if (open) event.preventDefault()
          }}
        >
          <DropdownMenuItem onSelect={() => setOpen(true)}>Saves</DropdownMenuItem>
          <DropdownMenuItem>Something else</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Saves for Made-up Game" closeLabel="Close" returnFocus={more}>
          <p className="text-sm text-pretty">
            The menu closed as this opened. Closing this puts focus back on the menu’s button, as
            the item that opened it has gone.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A menu's item opens it, the menu closes, and closing it goes back to the menu's button. */
export const OpenedFromAMenu: Story = {
  render: () => <FromAMenu />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const more = page.getByRole('button', { name: 'More' })
    await userEvent.click(more)
    await userEvent.click(await page.findByRole('menuitem', { name: 'Saves' }))
    const dialog = await page.findByRole('dialog', { name: 'Saves for Made-up Game' })
    await expect(page.queryByRole('menu')).toBeNull()
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(page.queryByRole('dialog')).toBeNull()
    await expect(more).toHaveFocus()
  },
}

/** A question inside it is asked in place, never as a second dialog; Escape answers it and stays. */
export const AskingInPlace: Story = {
  render: () => (
    <Opened title="Saves for Made-up Game">
      <ul className="grid gap-2">
        {['Today at 19:30', 'Yesterday at 21:10'].map((when) => (
          <li
            key={when}
            className="flex flex-wrap items-center gap-3 rounded-control border border-line px-3 py-2"
          >
            <span className="flex-1 text-sm">{when}</span>
            <ConfirmInPlace
              title={`Restore the saves from ${when}?`}
              description="What’s on this computer now is backed up first, so this can be undone."
              confirm="Restore"
              cancel="Cancel"
              onConfirm={() => undefined}
              className="basis-full"
            >
              <Button size="sm">Restore</Button>
            </ConfirmInPlace>
          </li>
        ))}
      </ul>
    </Opened>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Saves for Made-up Game' })
    const [restore] = within(dialog).getAllByRole('button', { name: 'Restore' })
    await userEvent.click(restore!)
    const question = within(dialog).getByRole('group', { name: /Restore the saves from Today/ })
    await expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await expect(page.queryByRole('alertdialog')).toBeNull()
    await userEvent.keyboard('{Escape}')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(restore).toHaveFocus()
  },
}
