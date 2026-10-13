import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ThemePicker } from './theme-picker'
import { ThemeSwitch } from './theme-switch'

const meta = {
  title: 'Theme',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj

/** The header's control: one button that opens the three choices. */
export const Switch: Story = { render: () => <ThemeSwitch /> }

/** The same three choices in a row, for use inside a page. */
export const Picker: Story = { render: () => <ThemePicker /> }
