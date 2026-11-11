import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { MediaFailure, MediaSkeleton, Screenshots } from './screenshots'
import { MineFields } from './mine-fields'

import './game-detail.css'

/** Made-up picture ids stand on a color wash; the workshop needs no real game or video service. */
const shots = [
  { id: 'gallery_one', width: 1920, height: 1080 },
  { id: 'gallery_two', width: 1920, height: 1080 },
  { id: 'gallery_three', width: 1920, height: 1080 },
]
const meta = {
  title: 'Features/Game/Gallery',
  component: Screenshots,
  args: { title: 'Tidewater', shots },
  decorators: [
    (Story) => (
      <div className="game @container max-w-3xl [&_.gallery-poster]:bg-surface-raised [&_.gallery-thumb]:bg-surface-raised [&_img]:invisible">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Screenshots>
export default meta
type Story = StoryObj<typeof meta>

export const ScreenshotsOnly: Story = {}
export const VideoPoster: Story = {
  args: { videos: [{ id: 'made_up_video', name: 'Gameplay trailer' }] },
}
export const ManyVideos: Story = {
  args: { videos: [1, 2, 3, 4].map((id) => ({ id: `made_up_${id}`, name: 'Trailer' })) },
}
export const ForAdults: Story = {
  args: { adult: true, shots: shots.map((shot) => ({ ...shot, mature: true })) },
}
export const NoMedia: Story = { args: { shots: [] } }
export const Waiting: Story = { render: () => <MediaSkeleton /> }
export const BlockedPlayback: Story = {
  render: () => (
    <div className="gallery-stage">
      <MediaFailure />
    </div>
  ),
}
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
}
export const ReducedMotion: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'With reduced motion or on a phone, even a saved autoplay choice waits for a press. The selected frame remains still.',
      },
    },
  },
  args: { videos: [{ id: 'made_up_video', name: 'Gameplay trailer' }] },
}
export const CollapsedRecord: Story = {
  render: () => (
    <MineFields label="Edit your game">
      <p className="py-4 text-sm">Status, rating, copies, hours and notes.</p>
    </MineFields>
  ),
}
