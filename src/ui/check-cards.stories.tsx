import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DiscIcon, Gamepad2Icon, MonitorIcon } from 'lucide-react'
import { useState } from 'react'

import { CheckCard, CheckCards } from './check-cards'

const meta = {
  title: 'UI/Check cards',
  component: CheckCards,
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckCards>

export default meta
type Story = StoryObj

const places = [
  { value: 'pc', label: 'PC', detail: 'Brought in from Steam', icon: <MonitorIcon /> },
  {
    value: 'switch',
    label: 'Nintendo Switch',
    detail: 'From Nintendo’s play history',
    icon: <Gamepad2Icon />,
  },
  { value: 'physical', label: 'Boxes on a shelf', detail: 'Found by title', icon: <DiscIcon /> },
]

function Places({ start = ['pc'], disabled }: { start?: string[]; disabled?: boolean }) {
  const [chosen, setChosen] = useState(new Set(start))
  return (
    <CheckCards legend="Where do you play?">
      {places.map((place) => (
        <CheckCard
          key={place.value}
          label={place.label}
          detail={place.detail}
          icon={place.icon}
          disabled={disabled && place.value === 'physical'}
          checked={chosen.has(place.value)}
          onChange={(event) => {
            const next = new Set(chosen)
            if (event.target.checked) next.add(place.value)
            else next.delete(place.value)
            setChosen(next)
          }}
        />
      ))}
    </CheckCards>
  )
}

/** Any number chosen: each chosen card has the accent's edge, a tinted face and a tick. */
export const Default: Story = { render: () => <Places /> }

/** Nothing chosen yet. */
export const NoneChosen: Story = { render: () => <Places start={[]} /> }

/** A card that can't be chosen now stays in its place, faded. */
export const OneDisabled: Story = { render: () => <Places disabled /> }
