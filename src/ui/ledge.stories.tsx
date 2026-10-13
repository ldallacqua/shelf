import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties } from 'react'

import { CoverPlaceholder, GameCase } from './game-case'
import { Ledge, ShelfLabel } from './ledge'

const meta = {
  title: 'UI/Ledge',
  component: Ledge,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl px-4 pt-20 pb-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Ledge>

export default meta
type Story = StoryObj<typeof meta>

const cases = (
  <>
    <GameCase shape="bluRay" frame="#1f5fd0" led="#ff7a3d">
      <CoverPlaceholder colors={['#ffb347', '#7a1f4d', '#e2502b']} />
    </GameCase>
    <GameCase shape="switch" frame="#d9202b" led="#22c8ee">
      <CoverPlaceholder colors={['#9ff3ff', '#123b8f', '#1fa8c9']} />
    </GameCase>
    <GameCase shape="keepCase" frame="#17191f" led="#ff4d5e">
      <CoverPlaceholder colors={['#ff9a8a', '#1a0a12', '#d92b3f']} />
    </GameCase>
    <GameCase shape="jewel" frame="#17191f" led="#ffc23d">
      <CoverPlaceholder colors={['#fff0a8', '#5b2a0c', '#e0a12b']} />
    </GameCase>
  </>
)

const scale = { '--mm': '0.8px', gap: '12px' } as CSSProperties

/** An empty shelf, lit by its LED bar. Switch the theme in the toolbar. */
export const Empty: Story = {
  args: {
    itemsClassName: 'h-40',
    label: <ShelfLabel count={0}>Library</ShelfLabel>,
  },
}

/** Cases facing out. The four real case shapes keep their proportions. */
export const WithCases: Story = {
  args: {
    style: scale,
    itemsClassName: 'justify-center gap-[inherit]',
    label: <ShelfLabel count={4}>PlayStation 4</ShelfLabel>,
    children: cases,
  },
}

/** Any shelf can take its own light color, as it does for the game in focus. */
export const OwnLightColor: Story = {
  args: {
    ...WithCases.args,
    style: { ...scale, '--led': '#ff7a3d' } as CSSProperties,
  },
}

/** A case in focus comes toward you and glows in its own color. */
export const CaseInFocus: Story = {
  args: {
    style: { ...scale, '--led': '#22c8ee' } as CSSProperties,
    itemsClassName: 'justify-center gap-[inherit]',
    label: <ShelfLabel count={2}>Nintendo Switch</ShelfLabel>,
    children: (
      <>
        <GameCase shape="switch" frame="#d9202b" led="#22c8ee" active>
          <CoverPlaceholder colors={['#9ff3ff', '#123b8f', '#1fa8c9']} />
        </GameCase>
        <GameCase shape="switch" frame="#d9202b" led="#7c5cff">
          <CoverPlaceholder colors={['#c9b8ff', '#141033', '#6a4df0']} />
        </GameCase>
      </>
    ),
  },
}

export const Label: StoryObj<typeof ShelfLabel> = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ShelfLabel count={38}>PlayStation 4</ShelfLabel>
      <ShelfLabel count={0}>Wishlist</ShelfLabel>
      <ShelfLabel>Playing</ShelfLabel>
    </div>
  ),
}
