import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { ColorField } from './color-field'

const meta = {
  title: 'UI/Color field',
  component: ColorField,
} satisfies Meta<typeof ColorField>

export default meta
type Story = StoryObj

function Picked({ hint, disabled }: { hint?: string; disabled?: boolean }) {
  const [color, setColor] = useState('#1f8fd6')
  return (
    <ColorField
      label="Accent"
      hint={hint}
      value={color}
      onValueChange={setColor}
      disabled={disabled}
      className="max-w-xs"
    />
  )
}

/** The device's own color picker opens from the swatch; the color is written beside it. */
export const Default: Story = { render: () => <Picked hint="Buttons, links and the focus ring" /> }

/** With no hint, the label alone names it. */
export const NoHint: Story = { render: () => <Picked /> }

/** A color that can't be changed now stays readable, faded. */
export const Disabled: Story = { render: () => <Picked hint="Not now" disabled /> }
