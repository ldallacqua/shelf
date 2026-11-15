import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { pick, standingOf, type Duel } from '@/domain/duel/bracket'
import { factsOf } from '@/domain/duel/facts'
import { countsOf, poolOf } from '@/domain/duel/pool'
import type { Status } from '@/domain/library/values'

import { BracketView } from './bracket-view'
import { Champion } from './champion'
import { DuelGhosts } from './duel-ghosts'
import { SignedInDuel } from './duel-page'
import { sampleBySlug, sampleGames, sampleLibrary, slugOf } from './duel-samples'
import { DuelWords } from './duel-words'
import { FaceOff } from './face-off'
import { FactTable } from './fact-table'
import { PickContenders } from './pick-contenders'

import './duel.css'

/**
 * The duel (spec 3.14): choosing the games, two face to face with their facts between them, the
 * bracket, and the game left. Games are washes of their own colors: no cover is drawn here.
 */
const meta = {
  title: 'Features/Duel',
  decorators: [
    (Story) => (
      <DuelWords>
        <div className="p-6">
          <Story />
        </div>
      </DuelWords>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const TODAY = '2026-11-14'
const eight = sampleGames.filter((game) => game.status === 'backlog').map((game) => game.slug)
const fresh: Duel = { contenders: eight, picks: [] }

/** Plays the duel this far, always sending on the first side. */
const played = (duel: Duel, count: number): Duel => {
  let next = duel
  for (let step = 0; step < count; step += 1) {
    const { current } = standingOf(next)
    if (!current) break
    next = pick(next, current.a)
  }
  return next
}

/** The facts between two games: the four measured rows with their bars, then what each is. */
export const Facts: Story = {
  render: () => {
    const a = sampleBySlug.get(slugOf('Celeste'))!
    const b = sampleBySlug.get(slugOf('Hades'))!
    return (
      <div className="max-w-md">
        <FactTable
          facts={factsOf([a, b], sampleLibrary.names, TODAY)}
          titles={[a.title, b.title]}
        />
      </div>
    )
  },
}

/** One side doesn't know a fact: it says so, and its bar stays empty. */
export const FactsWithAGap: Story = {
  render: () => {
    const a = sampleBySlug.get(slugOf('Silksong'))!
    const b = { ...sampleBySlug.get(slugOf('Inside'))!, igdbRating: undefined }
    return (
      <div className="max-w-md">
        <FactTable
          facts={factsOf([a, b], sampleLibrary.names, TODAY)}
          titles={[a.title, b.title]}
        />
      </div>
    )
  },
}

function Choosing({ start = [] as string[], from = ['backlog'] as Status[] }) {
  const [chosen, setChosen] = useState(start)
  const [statuses, setStatuses] = useState(from)
  return (
    <PickContenders
      pool={poolOf(sampleLibrary, statuses, false, 'en')}
      games={sampleBySlug}
      counts={countsOf(sampleLibrary, false)}
      from={statuses}
      chosen={chosen}
      onFrom={setStatuses}
      onChosen={setChosen}
      onStart={() => undefined}
    />
  )
}

/** Choosing, with nothing chosen yet: Start waits for two. */
export const ChoosingEmpty: Story = { render: () => <Choosing /> }

/** Four chosen, from the backlog and the wishlist: each game says its status. */
export const ChoosingSome: Story = {
  render: () => (
    <Choosing
      start={[slugOf('Celeste'), slugOf('Hades'), slugOf('Tunic'), slugOf('Silksong')]}
      from={['backlog', 'wishlist']}
    />
  ),
}

function Fight({ after = 0 }: { after?: number }) {
  const [duel, setDuel] = useState(() => played(fresh, after))
  const standing = standingOf(duel)
  if (!standing.current) return <p>{standing.champion}</p>
  return (
    <div className="grid gap-14">
      <FaceOff
        handle="ana"
        standing={{ ...standing, current: standing.current }}
        games={sampleBySlug}
        names={sampleLibrary.names}
        today={TODAY}
        said=""
        onPick={(slug) => setDuel(pick(duel, slug))}
        onUndo={() => setDuel({ ...duel, picks: duel.picks.slice(0, -1) })}
        onLeave={() => setDuel(fresh)}
      />
      <BracketView standing={standing} games={sampleBySlug} />
    </div>
  )
}

/** The first duel of eight games: Undo waits, and the bracket shows every place to come. */
export const FaceToFace: Story = { render: () => <Fight /> }

/** Into the semifinals: Undo takes the last choice back, and Change the games asks first. */
export const FaceToFaceLater: Story = { render: () => <Fight after={5} /> }

/** The bracket of five games: three go straight on, spread through the first round. */
export const BracketWithByes: Story = {
  render: () => (
    <BracketView
      standing={standingOf({ contenders: eight.slice(0, 5), picks: [] })}
      games={sampleBySlug}
    />
  ),
}

function Left({ already = false, saves = true }: { already?: boolean; saves?: boolean }) {
  const done = played(fresh, 7)
  const standing = standingOf(done)
  const winner = sampleBySlug.get(standing.champion!)!
  return (
    <div className="grid gap-14">
      <Champion
        handle="ana"
        game={already ? { ...winner, status: 'playing' } : winner}
        standing={standing}
        games={sampleBySlug}
        arrived={false}
        onStart={async () => saves}
        onUndo={() => undefined}
        onAgain={() => undefined}
        onOther={() => undefined}
      />
      <BracketView standing={standing} games={sampleBySlug} />
    </div>
  )
}

/** The game left, with the duels it won, Start playing it and the whole bracket. */
export const GameLeft: Story = { render: () => <Left /> }

/** The game left was already being played: it says so instead of offering to. */
export const GameLeftAlreadyPlaying: Story = { render: () => <Left already /> }

/** Start playing it couldn't be saved: it says so, in place. */
export const GameLeftNotSaved: Story = { render: () => <Left saves={false} /> }

/** While my games are read: choosing's ghosts, or a duel's when this device kept one. */
export const Ghosts: Story = { render: () => <DuelGhosts /> }

export const GhostsOfADuel: Story = { render: () => <DuelGhosts stage="fight" /> }

/** The whole page for an account, from choosing on, with the sample library. */
export const WholeDuel: Story = {
  render: () => (
    <SignedInDuel
      handle={`story-${Math.random().toString(36).slice(2)}`}
      read={async () => sampleLibrary}
      play={async () => ({ ok: true, value: { version: 2 } })}
    />
  ),
}

/** A shelf with nothing to choose from. */
export const NothingToDuel: Story = {
  render: () => (
    <SignedInDuel
      handle={`story-empty-${Math.random().toString(36).slice(2)}`}
      read={async () => ({ ...sampleLibrary, games: [] })}
    />
  ),
}
