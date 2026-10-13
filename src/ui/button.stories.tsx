import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlusIcon } from 'lucide-react'

import { Button } from './button'

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Filters' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'link'] },
    size: { control: 'inline-radio', options: ['default', 'sm', 'icon'] },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Secondary: Story = {}

export const Primary: Story = { args: { variant: 'primary', children: 'Add a game' } }

export const Ghost: Story = { args: { variant: 'ghost', children: 'Clear all' } }

export const Disabled: Story = { args: { disabled: true, children: 'Not available' } }

export const WithIcon: Story = {
  args: { variant: 'primary' },
  render: (args) => (
    <Button {...args}>
      <PlusIcon aria-hidden="true" />
      Add a game
    </Button>
  ),
}

export const IconOnly: Story = {
  args: { variant: 'ghost', size: 'icon', 'aria-label': 'Add a game' },
  render: (args) => (
    <Button {...args}>
      <PlusIcon aria-hidden="true" />
    </Button>
  ),
}

export const AsLink: Story = {
  args: { variant: 'primary', asChild: true },
  render: (args) => (
    <Button {...args}>
      <a href="https://www.igdb.com">IGDB.com</a>
    </Button>
  ),
}

export const All: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Add a game</Button>
      <Button variant="secondary">Filters</Button>
      <Button variant="ghost">Clear all</Button>
      <Button variant="link">Open on IGDB</Button>
      <Button disabled>Not available</Button>
    </div>
  ),
}
