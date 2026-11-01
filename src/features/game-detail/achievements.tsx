'use client'

import { EyeOffIcon, LayoutGridIcon, ListIcon, LockIcon, TrophyIcon } from 'lucide-react'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import type {
  AchievementProvider,
  AchievementSetView,
  AchievementView,
  GameAchievements,
} from '@/domain/achievements/achievements'
import {
  achievementFilters,
  achievementSorts,
  arrangeAchievements,
  progressOf,
  type AchievementFilter,
  type AchievementSort,
} from '@/domain/achievements/progress'
import { useShelf } from '@/features/library/shelf'
import type { LibraryFiles } from '@/features/library/shelf-address'
import { useAccount } from '@/features/owner/account'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { cn } from '@/ui/cn'
import { Progress } from '@/ui/progress'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Tip } from '@/ui/tooltip'

/**
 * A game's achievements on its page (issue 72), asked for as the page
 * opens, never in the library file: each set the game has at a provider,
 * how much of it is unlocked, and its achievements, which can be filtered
 * and ordered. A hidden one keeps its name and description out of sight
 * until it is unlocked, or until the reader asks to see them.
 *
 * A set opens as its icons, every one at once, the rare unlocks glowing,
 * and one of them told in full below, the rarest unlocked first: the whole
 * set in a few rows, and its story first (the owner, 28 Oct 2026: the list
 * "expands too long"). The list, a part at a time, is one choice away.
 */

/** Where a game's achievements are: one's own, fresh; a public shelf's, as the edge keeps them. */
const addressOf = (files: LibraryFiles, slug: string, locale: string) =>
  `${
    files.kind === 'public'
      ? `/api/v1/libraries/${files.key}/achievements/${encodeURIComponent(slug)}`
      : `/api/v1/me/achievements/${encodeURIComponent(slug)}`
  }?locale=${encodeURIComponent(locale)}`

type Loaded = { address: string } & (
  { status: 'ready'; achievements: GameAchievements } | { status: 'failed' }
)

/** The list shows this many before "Show all": enough to see what it holds. */
const SHOWN = 10

/** Under this share of a provider's players, an unlock is rare and glows, as Steam's library marks them. */
const RARE = 10

const views = ['grid', 'list'] as const
type View = (typeof views)[number]
const viewIcons = { grid: LayoutGridIcon, list: ListIcon } as const

const isRare = (achievement: AchievementView) =>
  achievement.state === 'unlocked' && achievement.rate !== undefined && achievement.rate < RARE

const isConcealed = (achievement: AchievementView, reveal: boolean) =>
  achievement.hidden && achievement.state !== 'unlocked' && !reveal

/** Whether it is unlocked, and when, in words. */
function useStateOf() {
  const t = useTranslations('Game.achievements')
  const format = useFormatter()
  return (achievement: AchievementView) =>
    achievement.state === 'unlocked'
      ? achievement.unlockedAt
        ? t('unlockedOn', {
            when: format.dateTime(new Date(achievement.unlockedAt), { dateStyle: 'medium' }),
          })
        : t('unlockedSometime')
      : achievement.state === 'locked'
        ? t('locked')
        : t('unknown')
}

/** The artwork, or a trophy where there is none or it does not load. */
function Artwork({ achievement, concealed }: { achievement: AchievementView; concealed: boolean }) {
  const [broken, setBroken] = useState(false)
  const unlocked = achievement.state === 'unlocked'
  const source = unlocked ? achievement.icon : (achievement.iconLocked ?? achievement.icon)
  // Framed while it loads, so a slow image is a tile and not a gap.
  const frame =
    'grid size-10 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-line bg-surface sm:size-12'
  if (concealed || !source || broken) {
    const Icon = concealed ? EyeOffIcon : unlocked ? TrophyIcon : LockIcon
    return (
      <span aria-hidden="true" className={cn(frame, 'text-muted')}>
        <Icon className="size-4" />
      </span>
    )
  }
  return (
    // A provider's artwork, at its own size: next/image would only add a request.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={cn(frame, !unlocked && !achievement.iconLocked && 'opacity-60 grayscale')}
    />
  )
}

/** One achievement told in full: its artwork, name, description, whether and when, how rare. */
function AchievementCard({
  achievement,
  source,
  reveal,
  as: Box,
  className,
}: {
  achievement: AchievementView
  source: string
  reveal: boolean
  as: 'li' | 'div'
  className?: string
}) {
  const t = useTranslations('Game.achievements')
  const format = useFormatter()
  const stateOf = useStateOf()
  const concealed = isConcealed(achievement, reveal)
  // Steam's words where it has none in this language: a screen reader says them as English.
  const lang = achievement.inEnglish && !concealed ? 'en' : undefined
  return (
    <Box className={cn('flex items-start gap-3 py-3', className)}>
      <Artwork achievement={achievement} concealed={concealed} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p
          lang={lang}
          className={cn(
            'text-sm font-medium text-pretty',
            achievement.state !== 'unlocked' && 'text-muted',
          )}
        >
          {concealed ? t('hiddenName') : achievement.name}
        </p>
        <p lang={lang} className="text-sm text-pretty text-muted">
          {concealed ? t('hiddenBody') : (achievement.description ?? null)}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 readout text-[0.625rem] text-muted">
          <span className={cn(achievement.state === 'unlocked' && 'text-text')}>
            {stateOf(achievement)}
          </span>
          {isRare(achievement) ? <span className="text-text">{t('rare')}</span> : null}
          {achievement.rate === undefined ? null : (
            <span>
              {t('rate', {
                rate: format.number(achievement.rate / 100, {
                  style: 'percent',
                  maximumFractionDigits: 1,
                }),
                source,
              })}
            </span>
          )}
        </p>
      </div>
    </Box>
  )
}

/**
 * Every achievement as its icon, a few rows for the whole set: the rare
 * unlocks glow in the room's light. One is chosen at a time, and told in
 * full below. The arrow keys move between them, Home and End go to the
 * ends, and the keyboard stops on the set once, not on each.
 */
function Icons({
  achievements,
  chosen,
  onChoose,
  reveal,
  label,
}: {
  achievements: readonly AchievementView[]
  chosen: AchievementView
  onChoose: (id: string) => void
  reveal: boolean
  label: string
}) {
  const t = useTranslations('Game.achievements')
  const stateOf = useStateOf()
  const list = useRef<HTMLUListElement>(null)
  const at = achievements.findIndex((each) => each.id === chosen.id)
  /** The icons as drawn, read when a key or a pointer asks, never while drawing. */
  const tiles = () => [...(list.current?.children ?? [])] as HTMLElement[]

  const go = (next: number) => {
    const to = Math.max(0, Math.min(achievements.length - 1, next))
    onChoose(achievements[to]!.id)
    tiles()[to]?.focus()
  }
  /** How many icons stand in a row as drawn now: the rows wrap with the page's width. */
  const perRow = () => {
    const drawn = tiles()
    const wrapped = drawn.findIndex((tile) => tile.offsetTop !== drawn[0]!.offsetTop)
    return wrapped === -1 ? drawn.length : wrapped
  }
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const moves: Record<string, () => number> = {
      ArrowRight: () => at + 1,
      ArrowLeft: () => at - 1,
      ArrowDown: () => at + perRow(),
      ArrowUp: () => at - perRow(),
      Home: () => 0,
      End: () => achievements.length - 1,
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    go(move())
  }

  return (
    <ul
      ref={list}
      role="listbox"
      aria-label={label}
      onKeyDown={onKeyDown}
      // One listener for every icon: the one under the pointer is chosen.
      onClick={(event) => {
        const tile = (event.target as HTMLElement).closest('[role="option"]')
        const index = tiles().findIndex((each) => each === tile)
        if (index !== -1) go(index)
      }}
      className="flex flex-wrap gap-2"
    >
      {achievements.map((achievement, index) => {
        const concealed = isConcealed(achievement, reveal)
        const name = concealed ? t('hiddenName') : achievement.name
        const selected = index === at
        return (
          <Tip key={achievement.id} label={name}>
            <li
              role="option"
              aria-selected={selected}
              aria-label={`${name}, ${stateOf(achievement)}`}
              tabIndex={selected ? 0 : -1}
              data-rare={isRare(achievement) ? '' : undefined}
              className={cn(
                'cursor-pointer rounded-[8px] p-0.5 transition-shadow duration-quick ease-settle outline-none',
                'focus-visible:ring-2 focus-visible:ring-focus',
                isRare(achievement) && 'shadow-glow',
                selected && 'ring-2 ring-text',
              )}
            >
              <Artwork achievement={achievement} concealed={concealed} />
            </li>
          </Tip>
        )
      })}
    </ul>
  )
}

/** What a set's state says, in a sentence, where there is no list to show. */
function Said({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p role={alert ? 'alert' : undefined} className="max-w-prose text-sm text-pretty text-muted">
      {children}
    </p>
  )
}

function SetOf({
  set,
  several,
  minor: Minor,
}: {
  set: AchievementSetView
  several: boolean
  minor: 'h3' | 'h4'
}) {
  const t = useTranslations('Game.achievements')
  const sync = useTranslations('Sync')
  const format = useFormatter()
  // "Read 3 hours ago" moves on by itself.
  const now = useNow({ updateInterval: 60_000 })
  const source = sync(`source.${set.provider}`)
  const id = useId()
  const [filter, setFilter] = useState<AchievementFilter>('all')
  const [sort, setSort] = useState<AchievementSort>('provider')
  const [reveal, setReveal] = useState(false)
  const [all, setAll] = useState(false)
  const [view, setView] = useState<View>('grid')
  const [chosenId, setChosenId] = useState<string>()

  const when = (at: number) => format.relativeTime(Math.min(at, now.getTime()), now)
  const heading = several ? (
    <Minor className="text-sm font-medium">{t('setTitle', { title: set.title, source })}</Minor>
  ) : null

  if (set.state !== 'ready') {
    return (
      <div className="grid gap-2">
        {heading}
        <Said alert={set.state === 'failed'}>{t(`state.${set.state}`, { source })}</Said>
      </div>
    )
  }

  const progress = progressOf(set)!
  const hidden = set.achievements.filter((each) => each.hidden && each.state !== 'unlocked').length
  const counts: Record<AchievementFilter, number> = {
    all: progress.total,
    unlocked: progress.earned,
    locked: set.achievements.filter((each) => each.state === 'locked').length,
  }
  const arranged = arrangeAchievements(set.achievements, filter, sort)
  const shown = all ? arranged : arranged.slice(0, SHOWN)
  // The icons open on the rarest unlocked: the set's story first. Without one, on the first.
  const rarest = arranged
    .filter((each) => each.state === 'unlocked' && each.rate !== undefined)
    .reduce<AchievementView | undefined>(
      (best, each) => (best === undefined || each.rate! < best.rate! ? each : best),
      undefined,
    )
  const chosen = arranged.find((each) => each.id === chosenId) ?? rarest ?? arranged[0]
  const day = format.dateTime(new Date(set.readAt!), { dateStyle: 'medium' })
  const freshness = set.snapshot
    ? t('snapshot', { source, day })
    : set.problem
      ? t(`stale.${set.problem}`, { source, day })
      : t('readAt', { source, when: when(set.readAt!) })

  return (
    <div className="@container grid gap-4">
      {heading}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm">
            {progress.complete
              ? t('complete', { total: progress.total })
              : t('earned', { earned: progress.earned, total: progress.total })}
          </p>
          {progress.percent === undefined ? null : (
            <p className="readout text-xs text-muted">
              {format.number(progress.percent / 100, { style: 'percent' })}
            </p>
          )}
        </div>
        <Progress
          value={progress.earned}
          max={progress.total}
          aria-label={t('progressLabel', { source })}
        />
        <p className="text-xs text-pretty text-muted">
          {freshness}
          {progress.unknown > 0 ? ` ${t('added', { count: progress.unknown })}` : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Segmented aria-label={t('view.label')} value={view} onValueChange={setView}>
          {views.map((each) => {
            const Icon = viewIcons[each]
            return (
              <Tip key={each} label={t(`view.${each}`)} className="sm:hidden">
                <SegmentedItem value={each} aria-label={t(`view.${each}`)}>
                  <Icon aria-hidden="true" />
                  <span aria-hidden="true" className="max-sm:hidden">
                    {t(`view.${each}`)}
                  </span>
                </SegmentedItem>
              </Tip>
            )
          })}
        </Segmented>
        <Segmented
          aria-label={t('filter.label')}
          value={filter}
          onValueChange={(value) => {
            setFilter(value)
            setAll(false)
          }}
        >
          {achievementFilters.map((each) => (
            <SegmentedItem key={each} value={each}>
              {t(`filter.${each}`, { count: counts[each] })}
            </SegmentedItem>
          ))}
        </Segmented>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-sort`} className="text-sm text-muted">
            {t('sort.label')}
          </label>
          <Select value={sort} onValueChange={(value) => setSort(value as AchievementSort)}>
            <SelectTrigger id={`${id}-sort`} className="w-auto min-w-44 px-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {achievementSorts.map((each) => (
                <SelectItem key={each} value={each}>
                  {t(`sort.${each}`, { source })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hidden > 0 ? (
          <label htmlFor={`${id}-reveal`} className="inline-flex items-center gap-3 text-sm">
            <Switch
              id={`${id}-reveal`}
              checked={reveal}
              onChange={(event) => setReveal(event.target.checked)}
            />
            {t('reveal', { count: hidden })}
          </label>
        ) : null}
      </div>

      {!chosen ? (
        <Said>{t('emptyFilter')}</Said>
      ) : view === 'grid' ? (
        <div className="grid gap-3">
          <Icons
            achievements={arranged}
            chosen={chosen}
            onChoose={setChosenId}
            reveal={reveal}
            label={t('iconsLabel', { source })}
          />
          {/* The one chosen, said again when another is. */}
          <div
            aria-live="polite"
            className="min-h-24 rounded-panel border border-line bg-surface px-4"
          >
            <AchievementCard achievement={chosen} source={source} reveal={reveal} as="div" />
          </div>
        </div>
      ) : (
        <>
          <ul className="grid border-t border-line @2xl:grid-cols-2 @2xl:gap-x-8">
            {shown.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                source={source}
                reveal={reveal}
                as="li"
                className="border-b border-line"
              />
            ))}
          </ul>
          {shown.length < arranged.length ? (
            <Button variant="secondary" size="sm" className="w-fit" onClick={() => setAll(true)}>
              {t('more', { count: arranged.length })}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

export function Achievements({
  slug,
  providers,
  minor,
  loading,
}: {
  slug: string
  /** The providers the game's facts say have its achievements. */
  providers: readonly AchievementProvider[]
  /** One below the section's heading, for a set's own when there are several. */
  minor: 'h3' | 'h4'
  /** What stands in the section while they are on their way. */
  loading: ReactNode
}) {
  const t = useTranslations('Game.achievements')
  const sync = useTranslations('Sync')
  const { files } = useShelf()
  const account = useAccount()
  const locale = useLocale()
  const address = addressOf(files, slug, locale)
  const [loaded, setLoaded] = useState<Loaded>()
  const [attempt, setAttempt] = useState(0)
  // Until the browser knows whose shelf this is, its own account would ask twice: once as a visitor.
  const waiting = account.status === 'checking'

  useEffect(() => {
    if (waiting) return
    const controller = new AbortController()
    fetch(address, {
      signal: controller.signal,
      cache: files.kind === 'mine' ? 'no-store' : 'default',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Achievements answered ${response.status}`)
        const achievements = (await response.json()) as GameAchievements
        setLoaded({ address, status: 'ready', achievements })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ address, status: 'failed' })
      })
    return () => controller.abort()
    // `providers` is new with each new version of the game's facts: a game just closed has new unlocks.
  }, [address, attempt, files.kind, waiting, providers])

  const current = loaded?.address === address ? loaded : undefined
  if (!current) return <div aria-busy="true">{loading}</div>
  if (current.status === 'failed') {
    return (
      <div className="grid justify-items-start gap-3">
        <Said alert>{t('loadFailed')}</Said>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          {t('retry')}
        </Button>
      </div>
    )
  }
  const { sets } = current.achievements
  // Its facts are a version behind: a provider linked again, not read yet.
  if (sets.length === 0) {
    return <Said>{t('state.pending', { source: sync(`source.${providers[0] ?? 'steam'}`) })}</Said>
  }
  return (
    <div className="grid gap-8">
      {sets.map((set) => (
        <SetOf
          key={`${set.provider}:${set.setId}`}
          set={set}
          several={sets.length > 1}
          minor={minor}
        />
      ))}
    </div>
  )
}
