import type { Meta, StoryObj } from '@storybook/nextjs-vite'

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

/**
 * The header on every page, here on a shelf: its links, and a visitor's ways
 * in. At phone width the links and the ways in fold into a menu.
 */
export const SiteHeader: Story = {
  render: () => <Header />,
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/en/u/sample',
        segments: [
          ['locale', 'en'],
          ['handle', 'sample'],
        ],
      },
    },
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
