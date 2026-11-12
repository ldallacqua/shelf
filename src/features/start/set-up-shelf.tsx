'use client'

import { ArrowLeftIcon, ArrowRightIcon, LibraryBigIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'

import type { Standing } from '@/domain/library/placing'
import {
  isSetupStep,
  nextStep,
  placesWithLinks,
  previousStep,
  setupSteps,
  type PlayPlace,
  type SetupMemory,
  type SetupStep,
} from '@/domain/setup/setup'
import type { ShowcaseGame } from '@/domain/setup/showcase'
import type { AddActions } from '@/features/add-game/actions'
import type { AddGame as AddGameType } from '@/features/add-game/add-game'
import { libraryHref } from '@/features/library/shelf-address'
import { useAccount } from '@/features/owner/account'
import { readTally } from '@/features/placing/placing-client'
import { readPlatforms, type PlatformRow } from '@/features/platforms/sync-client'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Loading } from '@/ui/ghost'
import { Ghosts } from '@/ui/ghosts'

import { readMyGames } from './my-games'
import { changeSetupMemory, settleSetupMemory, useSetupMemory } from './setup-memory'
import { SetupProgress } from './setup-progress'
import { BringStep, LookStep, PlayStep, ReadyStep, SortStep } from './setup-steps'
import { ShelfPreview } from './shelf-preview'

import './start.css'

type Tab = 'one' | 'list'

let addCode: Promise<typeof AddGameType> | undefined
/** The Add dialog's code, fetched when it is first reached for, as the header's button does. */
const loadAddGame = () =>
  (addCode ??= import('@/features/add-game/add-game').then((module) => module.AddGame))

const STEP_TITLE = 'setup-step-title'

/** How many of my games the shelves stand: as many as the ready step's widest shelf holds. */
const SHOWCASE = 12

/** The frame every step stands in: its heading and lead, what it holds, and the way on. */
function StepFrame({
  step,
  title,
  lead,
  heading,
  children,
  actions,
}: {
  step: SetupStep
  title: string
  lead: ReactNode
  heading?: Ref<HTMLHeadingElement>
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <section key={step} aria-labelledby={STEP_TITLE} className="setup-step mt-8 sm:mt-10">
      <h2
        id={STEP_TITLE}
        ref={heading}
        tabIndex={-1}
        // Focus brings it into view below the sticky header, with the line of steps above it.
        className="scroll-mt-40 title text-3xl text-balance outline-none sm:text-5xl"
      >
        {title}
      </h2>
      <div className="mt-4 max-w-2xl text-lg text-pretty text-muted">{lead}</div>
      <div className="mt-8">{children}</div>
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {actions}
      </div>
    </section>
  )
}

/** The page's frame while it asks whose account this is: the first step's words, its cards as ghosts. */
function SetupGhosts() {
  const t = useTranslations('Start')
  const account = useTranslations('AccountPage')
  return (
    <Loading label={account('checking')}>
      <StepFrame step="play" title={t('play.title')} lead={<p>{t('play.lead')}</p>} actions={null}>
        <Ghosts lines={4} className="max-w-xl" />
      </StepFrame>
    </Loading>
  )
}

/**
 * The steps, once the account is known (spec 4.6). Where the flow stands and where I play are
 * this device's (`setup-memory.ts`); everything a step changes is kept where it always is, so
 * going through the steps again, as Settings offers, loses nothing. Each step is an entry in the
 * browser's history (`#bring`), so Back goes to the step before.
 */
function Setup({
  handle,
  shelfPublic,
  add,
}: {
  handle: string
  shelfPublic: boolean
  add?: AddActions
}) {
  const t = useTranslations('Start')
  const sync = useTranslations('Sync')
  const memory = useSetupMemory(handle)
  const [rows, setRows] = useState<PlatformRow[]>()
  const [standing, setStanding] = useState<Standing>()
  const [trouble, setTrouble] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [AddGame, setAddGame] = useState<typeof AddGameType>()
  const [adding, setAdding] = useState<{ tab: Tab; open: boolean }>()
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const change = useCallback(
    (to: (memory: SetupMemory) => SetupMemory) => changeSetupMemory(handle, to),
    [handle],
  )

  // The step it opened on, kept and named in the address, once the page knows it.
  const opened = memory !== undefined
  useEffect(() => {
    if (opened) settleSetupMemory(handle)
  }, [opened, handle])

  // Back and Forward between steps.
  useEffect(() => {
    const onPop = () => {
      const named = window.location.hash.slice(1)
      if (!isSetupStep(named)) return
      moved.current = true
      change((current) => ({ ...current, step: named }))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [change])

  // A step that opens on a move takes focus, so a screen reader hears where it is.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    heading.current?.focus()
  }, [memory?.step])

  // Which platforms are linked, from the first step on: a link already says where I play, and
  // ticks that place once, as the page opens. A place unticked after that stays unticked.
  useEffect(() => {
    const abort = new AbortController()
    void readPlatforms(abort.signal).then((answer) => {
      if (abort.signal.aborted || !answer.ok) return
      setRows(answer.value)
      const linked = answer.value.flatMap((row) => (row.link ? [row.source] : []))
      change((current) => ({ ...current, places: placesWithLinks(current.places, linked) }))
    })
    return () => abort.abort()
  }, [change])

  // The tally, read again whenever a card's counts move or something was added.
  const moving = rows ? JSON.stringify(rows.map((row) => row.link?.counts ?? null)) : ''
  useEffect(() => {
    const abort = new AbortController()
    void readTally(abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      setTrouble(!answer.ok)
      if (answer.ok) setStanding(answer.value)
    })
    return () => abort.abort()
  }, [moving, attempt])

  const onRows = useCallback((next: PlatformRow[]) => setRows(next), [])

  // My own games, to stand on the preview's and the ready step's shelves: read from my library
  // file once the shelf has any, again on reaching the end, and after adding some here. Until it
  // arrives, or if it can't be read, cases in the room's colors stand in.
  const hasGames = Object.values(standing?.tally ?? {}).some((count) => count > 0)
  const atTheEnd = memory?.step === 'ready'
  const [showcase, setShowcase] = useState<ShowcaseGame[]>()
  useEffect(() => {
    if (!hasGames) return
    let live = true
    void readMyGames(SHOWCASE).then((games) => {
      if (live && games) setShowcase(games)
    })
    return () => {
      live = false
    }
  }, [hasGames, atTheEnd, attempt])

  const go = (step: SetupStep) => {
    if (!memory || step === memory.step) return
    moved.current = true
    window.history.pushState(null, '', `#${step}`)
    change((current) => ({
      ...current,
      step,
      looked: current.looked || current.step === 'look',
    }))
  }

  const openAdd = (tab: Tab) =>
    void loadAddGame().then((dialog) => {
      setAddGame(() => dialog)
      setAdding({ tab, open: true })
    })

  if (!memory) return <SetupGhosts />

  const { step, places } = memory
  const total = standing
    ? Object.values(standing.tally).reduce((sum, count) => sum + count, 0)
    : undefined
  const unsorted = standing?.tally.unsorted ?? 0
  const waiting = rows?.reduce((sum, row) => sum + (row.link?.counts['needs-you'] ?? 0), 0) ?? 0
  const linked = (rows ?? []).flatMap((row) => (row.link ? [sync(`source.${row.source}`)] : []))
  const done = {
    play: places.length > 0,
    bring: total !== undefined && total > 0 && rows !== undefined && waiting === 0,
    look: memory.looked || setupSteps.indexOf(step) > setupSteps.indexOf('look'),
    sort: total !== undefined && total > 0 && unsorted === 0,
  }
  const later = (
    <Link
      href={libraryHref(handle)}
      className="inline-flex min-h-6 items-center rounded-[2px] text-sm text-muted underline decoration-1 underline-offset-4 hover:text-text"
    >
      {t('later')}
    </Link>
  )

  const back =
    step === 'play' ? null : (
      <Button variant="ghost" onClick={() => go(previousStep(step))}>
        <ArrowLeftIcon aria-hidden="true" />
        {t('back')}
      </Button>
    )
  const forward = (
    <>
      <span className="flex-1" />
      {step !== 'sort' && step !== 'ready' && !done[step] ? (
        <Button variant="ghost" onClick={() => go(nextStep(step))}>
          {t('skip')}
        </Button>
      ) : null}
      <Button variant="primary" onClick={() => go(nextStep(step))}>
        {step === 'sort' ? t('finish') : t('next')}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </>
  )

  const failed = trouble ? (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p>{t('failed')}</p>
      <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
        {t('retry')}
      </Button>
    </div>
  ) : null

  const lead =
    step === 'ready' ? (
      total === undefined ? null : (
        <p>{t('ready.lead', { count: total })}</p>
      )
    ) : (
      <p>{t(`${step}.lead`)}</p>
    )

  const frame = (children: ReactNode) => (
    <StepFrame
      step={step}
      title={t(`${step}.title`)}
      lead={lead}
      heading={heading}
      actions={
        step === 'ready' ? (
          <>
            {back}
            <span className="flex-1" />
            <Button variant="primary" asChild className="h-12 px-6 text-base">
              <Link href={libraryHref(handle)}>
                <LibraryBigIcon aria-hidden="true" />
                {t('ready.toShelf')}
              </Link>
            </Button>
          </>
        ) : (
          <>
            {back}
            {forward}
          </>
        )
      }
    >
      {failed}
      {children}
    </StepFrame>
  )

  const body =
    step === 'play'
      ? frame(
          <PlayStep
            places={places}
            onChange={(next: PlayPlace[]) => change((current) => ({ ...current, places: next }))}
          />,
        )
      : step === 'bring'
        ? frame(
            <BringStep
              handle={handle}
              places={places}
              total={total}
              waiting={waiting}
              onRows={onRows}
              onAdd={openAdd}
            />,
          )
        : step === 'look'
          ? frame(<LookStep />)
          : step === 'sort'
            ? frame(<SortStep total={total} unsorted={unsorted} trouble={trouble} />)
            : frame(
                <ReadyStep
                  handle={handle}
                  total={total}
                  games={showcase}
                  unsorted={unsorted}
                  linked={linked}
                  places={places}
                  shelfPublic={shelfPublic}
                />,
              )

  return (
    <div className="mt-4 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className={step === 'ready' ? 'min-w-0 lg:col-span-2' : 'min-w-0'}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0 flex-1 basis-80">
            <SetupProgress current={step} done={done} onPick={go} />
          </div>
          {step === 'ready' ? null : later}
        </div>
        {body}
      </div>
      {step === 'ready' ? null : (
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <ShelfPreview
              handle={handle}
              total={total}
              games={showcase}
              linked={linked}
              shelfPublic={shelfPublic}
            />
          </div>
        </div>
      )}
      {AddGame && add && adding ? (
        <AddGame
          key={adding.tab}
          open={adding.open}
          startOn={adding.tab}
          actions={add}
          onOpenChange={(open) => {
            setAdding({ ...adding, open })
            // Whatever was added counts at once.
            if (!open) setAttempt((value) => value + 1)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Setting a new shelf up (spec 4.6), where signing up leads and Settings can lead again: where I
 * play, my games brought in, my colors, my games sorted, then my shelf. Nothing here is new to
 * the product: the platform cards are Settings', the Add dialog is the header's, the colors are
 * Appearance's and the sorting is Organize's, offered in the order a new shelf needs them.
 */
export function SetUpShelf({ add }: { add?: AddActions }) {
  const t = useTranslations('Start')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount('checking')

  if (who.status === 'visitor') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signInFirst')}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/start` } }}>
              {account('signIn')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (who.status === 'checking') return <SetupGhosts />
  return <Setup handle={who.handle} shelfPublic={who.shelfPublic} add={add} />
}
