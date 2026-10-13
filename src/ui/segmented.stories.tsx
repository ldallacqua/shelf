import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { Segmented, SegmentedItem } from './segmented'

const meta = {
  title: 'UI/Segmented',
  component: Segmented,
} satisfies Meta<typeof Segmented>

export default meta
type Story = StoryObj

function Views() {
  const [view, setView] = useState<'shelf' | 'wall' | 'list'>('shelf')
  return (
    <Segmented aria-label="View" value={view} onValueChange={setView}>
      <SegmentedItem value="shelf">Shelf</SegmentedItem>
      <SegmentedItem value="wall">Wall</SegmentedItem>
      <SegmentedItem value="list">List</SegmentedItem>
    </Segmented>
  )
}

function Dimensions() {
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  return (
    <Segmented aria-label="Shelf depth" value={mode} onValueChange={setMode}>
      <SegmentedItem value="2d">2D</SegmentedItem>
      <SegmentedItem value="3d">3D</SegmentedItem>
    </Segmented>
  )
}

/** Exactly one option is pressed. Arrow keys move between them. */
export const View: Story = { render: () => <Views /> }

export const TwoOptions: Story = { render: () => <Dimensions /> }
