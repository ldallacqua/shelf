import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'

const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj

function SortMenu() {
  const [sort, setSort] = useState('title')
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button>Sort</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label="Sort by" value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rating">My rating</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="added">Date added</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Surprise me</DropdownMenuItem>
        <DropdownMenuItem disabled>Not available</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Opens from a button. One choice in the group is checked. */
export const Choices: Story = { render: () => <SortMenu /> }
