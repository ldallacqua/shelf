import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import type { PlayPlace, SetupStep } from '@/domain/setup/setup'

import { SetupProgress } from './setup-progress'
import { LookStep, PlayStep, ReadyStep, SortStep } from './setup-steps'
import { ShelfPreview } from './shelf-preview'

import './start.css'

/**
 * Setting a shelf up (spec 4.6): the line of steps, the preview of the shelf beside them, and
 * each step's own part. The platform cards of "Bring your games in" are Settings' own, with
 * their stories there; the page itself asks the server, so it is seen in the app.
 */
const meta = {
  title: 'Features/Setting a shelf up',
  decorators: [
    (Story) => (
      <div className="max-w-4xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj

const none = { play: false, bring: false, look: false, sort: false }

function Line({ start, done }: { start: SetupStep; done: typeof none }) {
  const [step, setStep] = useState<SetupStep>(start)
  return <SetupProgress current={step} done={done} onPick={setStep} />
}

/** A new shelf: the first step lit, nothing done. Each segment is a button. */
export const ProgressAtTheStart: Story = { render: () => <Line start="play" done={none} /> }

/** Half-way: where I play chosen, my games in, the colors still to see. */
export const ProgressHalfWay: Story = {
  render: () => <Line start="look" done={{ ...none, play: true, bring: true }} />,
}

/** Every step done, at the end. */
export const ProgressAtTheEnd: Story = {
  render: () => <Line start="ready" done={{ play: true, bring: true, look: true, sort: true }} />,
}

/** The shelf beside the steps, before its first game. */
export const PreviewEmpty: Story = {
  render: () => (
    <div className="w-76">
      <ShelfPreview handle="ana" total={0} linked={[]} shelfPublic />
    </div>
  ),
}

/** A shelf Steam has filled, private. A case for each game, up to seven. */
export const PreviewFilled: Story = {
  render: () => (
    <div className="w-76">
      <ShelfPreview handle="ana" total={240} linked={['Steam', 'Nintendo']} shelfPublic={false} />
    </div>
  ),
}

/** Before the tally arrives. */
export const PreviewCounting: Story = {
  render: () => (
    <div className="w-76">
      <ShelfPreview handle="ana" total={undefined} linked={[]} shelfPublic />
    </div>
  ),
}

function Places({ start }: { start: PlayPlace[] }) {
  const [places, setPlaces] = useState(start)
  return <PlayStep places={places} onChange={setPlaces} />
}

/** Where I play, nothing chosen: continuing offers every way in. */
export const WhereYouPlay: Story = { render: () => <Places start={[]} /> }

/** Where I play, a PC and a Switch chosen. */
export const WhereYouPlayChosen: Story = { render: () => <Places start={['pc', 'switch']} /> }

/** The lights and the colors, this device's: they change the page at once. */
export const YourColors: Story = { render: () => <LookStep /> }

export const SortingNothingYet: Story = {
  render: () => <SortStep total={0} unsorted={0} trouble={false} />,
}

export const SortingWaiting: Story = {
  render: () => <SortStep total={240} unsorted={180} trouble={false} />,
}

export const SortingDone: Story = {
  render: () => <SortStep total={240} unsorted={0} trouble={false} />,
}

export const SortingCounting: Story = {
  render: () => <SortStep total={undefined} unsorted={0} trouble={false} />,
}

/** Ready, for someone who plays on a PC: Shelf for Windows leads what comes next. */
export const ReadyOnAPc: Story = {
  render: () => (
    <ReadyStep
      handle="ana"
      total={240}
      unsorted={12}
      linked={['Steam']}
      places={['pc']}
      shelfPublic
    />
  ),
}

/** Ready, an empty private shelf played on consoles: the filter leads. */
export const ReadyEmpty: Story = {
  render: () => (
    <ReadyStep
      handle="ana"
      total={0}
      unsorted={0}
      linked={[]}
      places={['playstation', 'physical']}
      shelfPublic={false}
    />
  ),
}
