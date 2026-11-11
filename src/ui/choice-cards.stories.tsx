import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { ChoiceCard, ChoiceCards } from './choice-cards'

const meta = {
  title: 'UI/Choice cards',
  component: ChoiceCards,
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoiceCards>

export default meta
type Story = StoryObj

const picture = (className: string) => <span className={`block h-20 ${className}`} />

function Sizes({ disabled }: { disabled?: boolean }) {
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium')
  return (
    <>
      <h2 id="sizes" className="mb-3 text-lg font-medium">
        Cover size
      </h2>
      <ChoiceCards aria-labelledby="sizes" value={size} onValueChange={setSize}>
        <ChoiceCard
          value="small"
          label="Small"
          detail="More on a row"
          picture={picture('bg-wall-deep')}
        />
        <ChoiceCard value="medium" label="Medium" picture={picture('bg-surface-raised')} />
        <ChoiceCard
          value="large"
          label="Large"
          detail="Fewer, bigger"
          disabled={disabled}
          picture={picture('bg-ledge')}
        />
      </ChoiceCards>
    </>
  )
}

/** Exactly one card is chosen: a thicker edge in the accent and a check. The arrow keys move and choose. */
export const Default: Story = { render: () => <Sizes /> }

/** A card that can't be chosen now stays in its place, faded, and the arrow keys pass it by. */
export const OneDisabled: Story = { render: () => <Sizes disabled /> }
