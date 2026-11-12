import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { presetNames } from '@/domain/colorway/names'
import { presets } from '@/domain/colorway/presets'

import { ColorwayPicker, ColorwayRoom, ownStyle } from './colorway-picker'
import { OwnColorwayEditor, ownFrom } from './own-colorway'
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

/**
 * The colorways, in Settings' Appearance (issue 206). Each card is a corner of
 * the room in its own colors, in the theme that is on; choosing one paints the
 * whole page, as a change of light.
 */
export const Colors: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="max-w-3xl">
      <h2 id="colors-title" className="mb-3 text-xl font-medium">
        Colors
      </h2>
      <ColorwayPicker labelledBy="colors-title" />
    </div>
  ),
}

/** Every colorway with the lights on and off, side by side, to compare them. */
export const EveryColorway: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-3">
      {presetNames.flatMap((name) =>
        (['light', 'dark'] as const).map((theme) => (
          <div key={`${name}-${theme}`} data-theme={theme} className="grid gap-1 bg-wall p-2">
            <span className="text-xs text-muted">
              {name}, {theme}
            </span>
            <ColorwayRoom colorway={name} className="rounded-control" />
          </div>
        )),
      )}
    </div>
  ),
}

function OwnEditor() {
  const [own, setOwn] = useState(() => ownFrom(presets.ocean, 'ocean'))
  return (
    <div data-colors="own" style={ownStyle(own.colors)} className="grid gap-4 bg-wall p-4">
      <OwnColorwayEditor own={own} onChange={setOwn} />
      <ColorwayRoom colorway="own" className="max-w-3xl rounded-control" />
    </div>
  )
}

/**
 * One's own colorway: three colors, each worked out for both themes as it is
 * picked, which repaints everything around it. Here only the frame around the
 * editor is painted, as the page would be.
 */
export const YourOwn: Story = { parameters: { layout: 'padded' }, render: () => <OwnEditor /> }
