'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { pick, standingOf, startDuel, undo, type Duel } from '@/domain/duel/bracket'
import { duelStatuses, stillStanding, type DuelMemory } from '@/domain/duel/memory'
import { countsOf, poolOf } from '@/domain/duel/pool'
import type { Library, LibraryGame } from '@/domain/library/library'
import type { Status } from '@/domain/library/values'
import { editClient } from '@/features/game-detail/edit-client'
import { libraryHref } from '@/features/library/shelf-address'
import { useAdult } from '@/features/library/use-preference'
import { useAccount } from '@/features/owner/account'
import { announceChange } from '@/features/owner/library-change'
import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { BracketView } from './bracket-view'
import { Champion } from './champion'
import { changeDuelMemory, useDuelMemory } from './duel-memory'
import { DuelGhosts } from './duel-ghosts'
import { FaceOff } from './face-off'
import { readMyLibrary } from './my-library'
import { PickContenders } from './pick-contenders'
import './duel.css'

/** Today, as the library's days are written, for how long each game has waited. */
const todayOf = () => new Date().toISOString().slice(0, 10)

/**
 * Where focus goes after the page moves on by itself: the new part's heading, as it mounts. Never
 * cleared: a part takes focus only as it mounts, which only a move sets this for.
 */
type FocusTo = 'pick' | 'fight' | undefined

type DuelProps = {
  handle: string
  /** Reads my library; the tests and stories hand their own. */
  read?: (signal?: AbortSignal) => Promise<Library | undefined>
  /** Sets a game to Playing; the tests and stories hand their own. */
  play?: typeof editClient.update
}

/**
 * The duel for the account signed in (spec 3.14): my library read once, and the device's memory of
 * where the duel stands deciding what shows: choosing the games, a duel under way, or the game left.
 */
export function SignedInDuel({
  handle,
  read = readMyLibrary,
  play = editClient.update,
}: DuelProps) {
  const t = useTranslations('Duel')
  const rounds = useTranslations('Duel.fight.round')
  const locale = useLocale()
  const memory = useDuelMemory(handle)
  const [adult] = useAdult()
  const [library, setLibrary] = useState<Library | 'failed'>()
  const [attempt, setAttempt] = useState(0)
  const [said, setSaid] = useState('')
  /** How many games stayed chosen when a game in the kept duel left the shelf. */
  const [ended, setEnded] = useState<number>()
  const [arrived, setArrived] = useState(false)
  const [focusTo, setFocusTo] = useState<FocusTo>()
  const [today] = useState(todayOf)

  // My library, read once; then the kept duel, or the games chosen, checked against it: a game that
  // left the shelf meanwhile ends the duel, and the others stay chosen, saying so.
  useEffect(() => {
    const controller = new AbortController()
    read(controller.signal).then((read) => {
      if (controller.signal.aborted) return
      setLibrary(read ?? 'failed')
      if (!read) return
      const known = new Set(read.games.map(({ slug }) => slug))
      // The statuses kept on this device that still have games; when none has, every one that
      // has, so the list never opens empty. Only as the games arrive: a chip pressed off stays off.
      const offered: Status[] = duelStatuses.filter((status) =>
        read.games.some((game) => game.status === status),
      )
      changeDuelMemory(handle, (memory): DuelMemory => {
        const keptFrom = memory.from.filter((status) => offered.includes(status))
        const from = keptFrom.length > 0 ? keptFrom : offered
        const kept = memory.duel ? stillStanding(memory.duel, known) : undefined
        if (kept && 'left' in kept) {
          setEnded(kept.left.length)
          const { duel: _, ...rest } = memory
          return { ...rest, from, chosen: kept.left }
        }
        const chosen = memory.chosen.filter((slug) => known.has(slug))
        return { ...memory, from, chosen }
      })
    })
    return () => controller.abort()
  }, [read, attempt, handle])

  const games = useMemo(
    () =>
      new Map<string, LibraryGame>(
        library && library !== 'failed' ? library.games.map((game) => [game.slug, game]) : [],
      ),
    [library],
  )

  if (library === 'failed') {
    return (
      <div className="mt-8 grid max-w-xl gap-4">
        <p className="text-pretty" role="alert">
          {t('failed')}
        </p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setLibrary(undefined)
              setAttempt(attempt + 1)
            }}
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }
  if (!memory || !library) {
    return memory?.duel ? (
      <DuelGhosts stage="fight" />
    ) : (
      <>
        <Intro />
        <DuelGhosts />
      </>
    )
  }

  const hideAdult = adult === 'hidden'
  const counts = countsOf(library, hideAdult)
  const duel =
    memory.duel && memory.duel.contenders.every((slug) => games.has(slug)) ? memory.duel : undefined

  const setDuel = (next: Duel | undefined, chosen?: string[]) =>
    changeDuelMemory(handle, ({ duel: _, ...rest }) => ({
      ...rest,
      ...(chosen ? { chosen } : {}),
      ...(next ? { duel: next } : {}),
    }))

  const backToChoosing = () => {
    setDuel(undefined, duel?.contenders ? [...duel.contenders] : undefined)
    setArrived(false)
    setSaid('')
    setFocusTo('pick')
  }

  if (duel) {
    const standing = standingOf(duel)
    const titleOf = (slug: string) => games.get(slug)?.title ?? slug

    if (standing.current) {
      const current = standing.current
      return (
        <div className="mt-8 grid gap-14 sm:mt-10">
          <FaceOff
            handle={handle}
            standing={{ ...standing, current }}
            games={games}
            names={library.names}
            today={today}
            said={said}
            focusOnArrival={focusTo === 'fight'}
            onPick={(slug) => {
              const next = pick(duel, slug)
              setDuel(next)
              const after = standingOf(next).current
              if (!after) {
                setArrived(true)
                return
              }
              const pair = { winner: titleOf(slug), a: titleOf(after.a), b: titleOf(after.b) }
              setSaid(
                after.round === current.round
                  ? t('fight.next', pair)
                  : t('fight.nextRound', {
                      ...pair,
                      round: rounds(standing.rounds[after.round]?.name ?? 'final'),
                    }),
              )
            }}
            onUndo={() => {
              const back = undo(duel)
              setDuel(back)
              const again = standingOf(back).current
              setSaid(again ? t('fight.undone', { a: titleOf(again.a), b: titleOf(again.b) }) : '')
            }}
            onLeave={backToChoosing}
          />
          <BracketView standing={standing} games={games} />
        </div>
      )
    }

    const champion = standing.champion ? games.get(standing.champion) : undefined
    if (champion) {
      return (
        <div className="mt-8 grid gap-14 sm:mt-12">
          <Champion
            handle={handle}
            game={champion}
            standing={standing}
            games={games}
            arrived={arrived}
            onStart={async () => {
              const answer = await play(champion.slug, { status: 'playing' }).catch(() => undefined)
              if (!answer?.ok) return false
              announceChange({
                version: answer.value.version,
                slug: champion.slug,
                title: champion.title,
              })
              setLibrary({
                ...library,
                games: library.games.map((game) =>
                  game.slug === champion.slug ? { ...game, status: 'playing' } : game,
                ),
              })
              return true
            }}
            onUndo={() => {
              const back = undo(duel)
              setDuel(back)
              setArrived(false)
              const again = standingOf(back).current
              setSaid(again ? t('fight.undone', { a: titleOf(again.a), b: titleOf(again.b) }) : '')
              setFocusTo('fight')
            }}
            onAgain={() => {
              setDuel(startDuel(duel.contenders))
              setArrived(false)
              setSaid('')
              setFocusTo('fight')
            }}
            onOther={backToChoosing}
          />
          <BracketView standing={standing} games={games} />
        </div>
      )
    }
  }

  // Nothing to duel unless a status a duel draws from has a game.
  const offered: Status[] = duelStatuses.filter((status) => (counts[status] ?? 0) > 0)
  if (offered.length === 0) {
    // Games that wait only for a status can duel once placed: say so, and lead there.
    const unsorted = counts.unsorted ?? 0
    return (
      <EmptyLedge
        label={t('pick.inDuel')}
        title={t('empty.title')}
        body={unsorted > 0 ? t('empty.unsorted', { count: unsorted }) : t('empty.body')}
        action={
          <Button variant="primary" asChild>
            {unsorted > 0 ? (
              <Link href="/account/unsorted">{t('empty.sort')}</Link>
            ) : (
              <Link href={libraryHref(handle)}>{t('empty.action')}</Link>
            )}
          </Button>
        }
      />
    )
  }

  return (
    <>
      <Intro />
      <PickContenders
        focusOnArrival={focusTo === 'pick'}
        pool={poolOf(library, memory.from, hideAdult, locale)}
        games={games}
        counts={counts}
        from={memory.from}
        chosen={memory.chosen}
        {...(ended === undefined ? {} : { notice: t('pick.kept', { count: ended }) })}
        onFrom={(from) => changeDuelMemory(handle, (each) => ({ ...each, from }))}
        onChosen={(chosen) => changeDuelMemory(handle, (each) => ({ ...each, chosen }))}
        onStart={() => {
          if (memory.chosen.length < 2) return
          setDuel(startDuel(memory.chosen))
          setEnded(undefined)
          setSaid('')
          setFocusTo('fight')
        }}
      />
    </>
  )
}

/** What the page is for, in one sentence: while choosing, and before anything is known. */
function Intro() {
  const t = useTranslations('Duel')
  return <p className="mt-3 max-w-2xl text-pretty text-muted">{t('intro')}</p>
}

/**
 * The duel's page (spec 3.14): built ahead as its heading and ghosts, the same for everyone, and
 * filled in the browser for the account signed in. Anyone else is asked to sign in.
 */
export function DuelPage() {
  const t = useTranslations('Duel')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount('checking')
  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      {who.status === 'signed-in' ? null : <Intro />}
      {who.status === 'visitor' ? (
        <div className="mt-8 grid max-w-xl gap-6">
          <p className="text-pretty">{t('signInFirst')}</p>
          <div>
            <Button variant="primary" asChild>
              <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/duel` } }}>
                {account('signIn')}
              </Link>
            </Button>
          </div>
        </div>
      ) : who.status === 'checking' ? (
        <DuelGhosts />
      ) : (
        <SignedInDuel handle={who.handle} />
      )}
    </>
  )
}
