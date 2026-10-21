import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { Calendar } from './calendar'
import { Checkbox, Radio, Switch } from './checkbox'
import { ChoiceChip, ToggleChip } from './chip'
import { DatePicker } from './date-picker'
import { Input, Textarea } from './field'
import { Progress } from './progress'
import { Rating } from './rating'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'
import { TagInput } from './tag-input'

/** Every control a form is made of, in the page's own look. */
const meta = {
  title: 'UI/Fields',
} satisfies Meta

export default meta
type Story = StoryObj

const TODAY = '2026-10-21'
const dayLabels = { previousMonth: 'Previous month', nextMonth: 'Next month', clear: 'Clear' }

function TextFields() {
  return (
    <div className="grid max-w-sm gap-4">
      <label className="grid gap-1.5 text-sm font-medium">
        Name
        <Input placeholder="Short ones" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Hours played
        <Input inputMode="decimal" defaultValue="12,5" aria-invalid />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Notes
        <Textarea grow defaultValue="Borrowed this years ago and finally bought my own copy." />
      </label>
    </div>
  )
}

function Selects() {
  const [platform, setPlatform] = useState('ps5')
  const [status, setStatus] = useState('')
  return (
    <div className="grid max-w-sm gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="story-platform" className="text-sm font-medium">
          Platform
        </label>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger id="story-platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ps5">PlayStation 5</SelectItem>
            <SelectItem value="switch">Nintendo Switch</SelectItem>
            <SelectItem value="pc" detail="Windows, Mac, Linux">
              PC
            </SelectItem>
            <SelectSeparator />
            <SelectItem value="none">No copy</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="story-status" className="text-sm font-medium">
          Status
        </label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="story-status">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {['Playing', 'Backlog', 'Completed', 'Dropped', 'Wishlist'].map((name) => (
              <SelectItem key={name} value={name.toLowerCase()}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function Ratings() {
  const [rated, setRated] = useState<number | undefined>(8.5)
  const [unrated, setUnrated] = useState<number | undefined>()
  const props = {
    label: 'My rating',
    unrated: 'Not rated',
    clearLabel: 'Take the rating away',
    outOf: '/10',
    valueText: (value: number) => `${value} out of 10`,
    format: String,
  }
  return (
    <div className="grid max-w-md gap-6">
      <Rating
        {...props}
        value={rated}
        onValueChange={setRated}
        onClear={() => setRated(undefined)}
      />
      <Rating
        {...props}
        value={unrated}
        onValueChange={setUnrated}
        onClear={() => setUnrated(undefined)}
      />
    </div>
  )
}

function Days() {
  const [day, setDay] = useState<string | undefined>('2026-10-14')
  return (
    <div className="grid max-w-xs gap-1.5">
      <span id="story-day" className="text-sm font-medium">
        Completed on
      </span>
      <DatePicker
        aria-labelledby="story-day"
        value={day}
        onChange={setDay}
        placeholder="Choose a day"
        max={TODAY}
        today={TODAY}
        locale="en"
        labels={dayLabels}
      />
    </div>
  )
}

function Tags() {
  const [tags, setTags] = useState(['couch co-op', 'short'])
  return (
    <div className="grid max-w-md gap-1.5">
      <label htmlFor="story-tags" className="text-sm font-medium">
        Tags
      </label>
      <TagInput
        id="story-tags"
        value={tags}
        onChange={setTags}
        suggestions={['comfort game', 'cozy', 'couch co-op', 'replay', 'rpg', 'short']}
        placeholder="Add a tag"
        labels={{ remove: (tag) => `Remove the tag ${tag}`, suggestions: 'Tags you have used' }}
      />
    </div>
  )
}

function Choices() {
  const [status, setStatus] = useState('backlog')
  const [owned, setOwned] = useState(['pc'])
  const toggle = (platform: string) =>
    setOwned((list) =>
      list.includes(platform) ? list.filter((each) => each !== platform) : [...list, platform],
    )
  return (
    <div className="grid max-w-lg gap-5">
      <div className="flex flex-wrap gap-2">
        {['playing', 'backlog', 'completed'].map((each) => (
          <ChoiceChip
            key={each}
            type="radio"
            name="story-status"
            checked={status === each}
            onChange={() => setStatus(each)}
          >
            {each[0]!.toUpperCase() + each.slice(1)}
          </ChoiceChip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {['pc', 'ps5', 'switch'].map((each) => (
          <ToggleChip key={each} pressed={owned.includes(each)} onClick={() => toggle(each)}>
            {each.toUpperCase()}
          </ToggleChip>
        ))}
      </div>
      <div className="grid gap-3 text-sm">
        <label className="flex items-center gap-2.5">
          <Checkbox defaultChecked /> Add Half-Life
        </label>
        <label className="flex items-center gap-2.5">
          <Radio name="story-how" defaultChecked /> Add it to Mass Effect, as another copy
        </label>
        <label className="flex items-center gap-2.5">
          <Radio name="story-how" /> Add it as a game of its own
        </label>
        <label className="flex items-center gap-3">
          <Switch defaultChecked /> Visitors can read these notes
        </label>
      </div>
      <Progress value={12} max={30} aria-label="Progress" />
    </div>
  )
}

/** One line, several lines, and a value that is wrong: a dashed border, beside a message. */
export const Text: Story = { render: () => <TextFields /> }

/** A list drawn by the page. The list shows more than the button: "PC" has its systems. */
export const Choice: Story = { render: () => <Selects /> }

/** Out of ten, in half steps. Arrow keys move half a point; Home and End go to the ends. */
export const MyRating: Story = { render: () => <Ratings /> }

/** A day up to today, from a calendar. */
export const Day: Story = { render: () => <Days /> }

/** The calendar on its own: arrow keys move by a day or a week, Page Up and Down by a month. */
export const Month: Story = {
  render: () => (
    <Calendar
      value="2026-10-14"
      today={TODAY}
      max={TODAY}
      locale="en"
      labels={dayLabels}
      onSelect={() => {}}
    />
  ),
}

/** Type and press Enter or a comma; tags in use are offered as you type. */
export const TagList: Story = { render: () => <Tags /> }

/** Chips, a checkbox, radio buttons, a switch and a progress bar: state by shape as well as color. */
export const Chips: Story = { render: () => <Choices /> }
