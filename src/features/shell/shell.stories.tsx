import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Button } from '@/ui/button'

import { EmptyLedge } from './empty-ledge'
import { Footer } from './footer'
import { Header } from './header'
import { NotFound } from './not-found'

const meta = {
  title: 'Shell',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const onTheSampleShelf = {
  nextjs: {
    navigation: {
      pathname: '/en/u/sample',
      segments: [
        ['locale', 'en'],
        ['handle', 'sample'],
      ],
    },
  },
}

/**
 * The header on every page, here on a shelf: its links, and a visitor's ways
 * in. At phone width the links, the ways in and the language fold into a menu.
 */
export const SiteHeader: Story = {
  render: () => <Header />,
  parameters: onTheSampleShelf,
}

/**
 * On a phone, its menu open: the shelf's links, a visitor's ways in and, last,
 * the other language, said in that language. The name keeps its place from
 * 22rem. Signed in, with Add, the row is the account mock's to show.
 */
export const SiteHeaderOnAPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <Header />,
  parameters: onTheSampleShelf,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Menu' }))
    // The menu opens in a portal, outside the story's own element.
    const page = within(canvasElement.ownerDocument.body)
    await expect(
      await page.findByRole('menuitem', { name: 'Ler o Save State em português' }),
    ).toBeVisible()
  },
}

export const SiteFooter: Story = { render: () => <Footer /> }

/** The empty state of any shelf, as a visitor sees it. */
export const EmptyShelf: Story = {
  render: () => (
    <div className="px-4">
      <EmptyLedge
        label="Library"
        title="The shelf is being stocked."
        body="Games will stand here soon."
      />
    </div>
  ),
}

/** The same, for the owner: one action. */
export const EmptyShelfWithAction: Story = {
  render: () => (
    <div className="px-4">
      <EmptyLedge
        label="Library"
        title="Your shelf is empty."
        body="Add a game and it will stand here."
        action={<Button variant="primary">Add your first game</Button>}
      />
    </div>
  ),
}

export const PageNotFound: Story = { render: () => <NotFound /> }
