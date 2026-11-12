'use client'

import {
  BotIcon,
  CheckIcon,
  CircleIcon,
  CopyIcon,
  Disc3Icon,
  Gamepad2Icon,
  GamepadIcon,
  InboxIcon,
  ListPlusIcon,
  MonitorIcon,
  ScanSearchIcon,
  SearchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useSyncExternalStore, type ReactNode } from 'react'

import { isPreset } from '@/domain/colorway/names'
import { byHandOnly, playPlaces, sourcesFor, type PlayPlace } from '@/domain/setup/setup'
import { DownloadFacts, DownloadForWindows } from '@/features/desktop/download-windows'
import { libraryHref } from '@/features/library/shelf-address'
import { PlatformCards } from '@/features/platforms/platforms'
import type { PlatformRow } from '@/features/platforms/sync-client'
import { ColorwayPicker } from '@/features/theme/colorway-picker'
import { ThemePicker } from '@/features/theme/theme-picker'
import { useColorway } from '@/features/theme/use-colorway'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { CheckCard, CheckCards } from '@/ui/check-cards'
import { cn } from '@/ui/cn'
import { Ghosts } from '@/ui/ghosts'
import { Ledge, ShelfLabel } from '@/ui/ledge'
import { Progress } from '@/ui/progress'

const LINK = 'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

const placeIcons: Record<PlayPlace, LucideIcon> = {
  pc: MonitorIcon,
  switch: Gamepad2Icon,
  playstation: GamepadIcon,
  xbox: GamepadIcon,
  physical: Disc3Icon,
}

/** A panel inside a step: a heading, and what it holds. */
function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: ReactNode
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('grid gap-4 rounded-panel border border-line bg-surface p-5', className)}
    >
      <h3 className="flex items-center gap-2.5 title text-lg">
        {Icon ? (
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-control bg-accent/15 [&_svg]:size-4"
          >
            <Icon />
          </span>
        ) : null}
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Step 1: where I play, as cards to tick. It shapes what the next step offers. */
export function PlayStep({
  places,
  onChange,
}: {
  places: readonly PlayPlace[]
  onChange: (places: PlayPlace[]) => void
}) {
  const t = useTranslations('Start.play')
  return (
    <div className="grid gap-4">
      <CheckCards legend={t('legend')} legendHidden>
        {playPlaces.map((place) => {
          const Icon = placeIcons[place]
          return (
            <CheckCard
              key={place}
              name="places"
              value={place}
              label={t(`places.${place}.name`)}
              detail={t(`places.${place}.detail`)}
              icon={<Icon />}
              checked={places.includes(place)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...places, place]
                    : places.filter((each) => each !== place),
                )
              }
            />
          )
        })}
      </CheckCards>
      <p className="text-sm text-muted">{places.length === 0 ? t('none') : t('change')}</p>
    </div>
  )
}

/**
 * Step 2: the platform cards for where I play (spec 4.4), and adding by title for what no sync
 * reaches yet, in the Add dialog itself, on its search or its pasted list. Led by adding by title
 * when everything chosen is a place no sync reaches.
 */
export function BringStep({
  handle,
  places,
  total,
  waiting,
  onRows,
  onAdd,
}: {
  handle: string
  places: readonly PlayPlace[]
  total: number | undefined
  waiting: number
  onRows: (rows: PlatformRow[]) => void
  onAdd: (tab: 'one' | 'list') => void
}) {
  const t = useTranslations('Start.bring')
  const sources = sourcesFor(places)
  const handOnly = byHandOnly(places)
  const onlyByHand = places.length > 0 && handOnly.length === places.length

  const byHand = (
    <Panel key="hand" title={t('byHand.title')} icon={ListPlusIcon}>
      <p className="max-w-2xl text-pretty text-muted">
        {handOnly.length > 0 ? t('byHand.forPlaces') : t('byHand.body')}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant={onlyByHand ? 'primary' : 'secondary'} onClick={() => onAdd('one')}>
          <SearchIcon aria-hidden="true" />
          {t('byHand.search')}
        </Button>
        <Button variant="secondary" onClick={() => onAdd('list')}>
          <ListPlusIcon aria-hidden="true" />
          {t('byHand.paste')}
        </Button>
      </div>
    </Panel>
  )
  const synced = (
    <div key="synced" className="grid gap-5">
      <PlatformCards handle={handle} page="start" only={sources} onRows={onRows} />
    </div>
  )

  return (
    <div className="grid gap-5">
      {onlyByHand ? [byHand, synced] : [synced, byHand]}
      <p aria-live="polite" className="text-sm font-medium">
        {waiting > 0
          ? t('waiting', { count: waiting })
          : total === undefined
            ? null
            : t('onShelf', { count: total })}
      </p>
    </div>
  )
}

/** Step 3: how the room looks on this device: the lights, then the colors (spec 9). */
export function LookStep() {
  const t = useTranslations('Start.look')
  return (
    <div className="grid gap-5">
      <Panel title={t('lights')}>
        <p className="max-w-xl text-pretty text-muted">{t('lightsBody')}</p>
        <ThemePicker className="w-fit" />
      </Panel>
      <section className="grid gap-4 rounded-panel border border-line bg-surface p-5">
        <h3 id="setup-colors" className="title text-lg">
          {t('colors')}
        </h3>
        <p id="setup-colors-body" className="max-w-xl text-pretty text-muted">
          {t('colorsBody')}
        </p>
        <ColorwayPicker labelledBy="setup-colors" describedBy="setup-colors-body" />
      </section>
    </div>
  )
}

/** Step 4: the games that came in with no status, and the way to the page for placing them (spec 4.5). */
export function SortStep({
  total,
  unsorted,
  trouble,
}: {
  total: number | undefined
  unsorted: number
  trouble: boolean
}) {
  const t = useTranslations('Start.sort')
  if (total === undefined) return trouble ? null : <Ghosts lines={2} className="max-w-md" />
  if (total === 0) return <p className="text-muted">{t('nothingYet')}</p>
  if (unsorted === 0) return <p className="font-medium">{t('none', { count: total })}</p>
  return (
    <Panel title={t('waitingTitle')} icon={InboxIcon} className="max-w-xl">
      <p className="font-medium">{t('left', { count: unsorted, total })}</p>
      <Progress value={total - unsorted} max={total} aria-label={t('share')} />
      <div>
        <Button variant="primary" asChild>
          <Link href="/account/unsorted">
            <InboxIcon aria-hidden="true" />
            {t('go')}
          </Link>
        </Button>
      </div>
      <p className="text-sm text-pretty text-muted">{t('later')}</p>
    </Panel>
  )
}

/** The site's address never changes while the page is open. */
const noChange = () => () => {}

/** The address an assistant connects to, with a way to copy it. */
function AssistantAddress() {
  const t = useTranslations('Start.ready.next.assistant')
  // The site's own address is only known in the browser: the page is built ahead.
  const address = useSyncExternalStore(
    noChange,
    () => `${window.location.origin}/api/mcp/owner`,
    () => '',
  )
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-2">
      <code className="block truncate rounded-control border border-line bg-wall px-3 py-2 font-mono text-[0.8125rem]">
        {address || t('placeholder')}
      </code>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={!address}
          onClick={() =>
            void navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          <CopyIcon aria-hidden="true" />
          {t('copy')}
        </Button>
        <span role="status" className="text-sm text-muted">
          {copied ? t('copied') : null}
        </span>
      </div>
    </div>
  )
}

/**
 * The end (spec 4.6): the shelf lighting up, what was set up, the way to it, and three things to
 * do next. Shelf for Windows leads those for someone who plays on a PC.
 */
export function ReadyStep({
  handle,
  total,
  unsorted,
  linked,
  places,
  shelfPublic,
}: {
  handle: string
  total: number | undefined
  unsorted: number
  linked: readonly string[]
  places: readonly PlayPlace[]
  shelfPublic: boolean
}) {
  const t = useTranslations('Start.ready')
  const colors = useTranslations('Settings.colors')
  const { colorway } = useColorway()
  const pc = places.includes('pc')

  const desktop = (
    <Panel key="desktop" title={t('next.desktop.title')} icon={MonitorIcon}>
      <p className="text-pretty text-muted">{t('next.desktop.body')}</p>
      <div className="grid gap-2">
        <DownloadForWindows
          variant={pc ? 'primary' : 'secondary'}
          className="h-10 w-fit px-4 text-sm"
        />
        <DownloadFacts />
      </div>
    </Panel>
  )
  const assistant = (
    <Panel key="assistant" title={t('next.assistant.title')} icon={BotIcon}>
      <p className="text-pretty text-muted">{t('next.assistant.body')}</p>
      <AssistantAddress />
    </Panel>
  )
  const filter = (
    <Panel key="filter" title={t('next.filter.title')} icon={ScanSearchIcon}>
      <p className="text-pretty text-muted">{t('next.filter.body')}</p>
      <code className="block w-fit rounded-control border border-line bg-wall px-3 py-2 font-mono text-[0.8125rem]">
        {t('next.filter.example')}
      </code>
      <div>
        <Button variant="secondary" size="sm" asChild>
          <Link href={libraryHref(handle, { q: t('next.filter.example') })}>
            {t('next.filter.go')}
          </Link>
        </Button>
      </div>
    </Panel>
  )

  const item = (done: boolean, words: ReactNode) => (
    <li className="flex gap-2.5">
      {/* The words say whether it is done; the mark repeats it. */}
      {done ? (
        <CheckIcon
          aria-hidden="true"
          strokeWidth={2.5}
          className="mt-1 size-4 flex-none text-accent"
        />
      ) : (
        <CircleIcon aria-hidden="true" className="mt-1 size-4 flex-none text-muted" />
      )}
      <span>{words}</span>
    </li>
  )

  return (
    <div className="grid gap-10">
      <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div aria-hidden="true" className="setup-ready-shelf">
          <Ledge
            itemsClassName="h-24 sm:h-32"
            label={<ShelfLabel count={total ?? 0}>{handle}</ShelfLabel>}
          />
        </div>

        <section
          aria-labelledby="setup-summary"
          className="grid gap-3 rounded-panel border border-line bg-surface p-5"
        >
          <h3 id="setup-summary" className="readout text-[0.6875rem] text-muted">
            {t('summary')}
          </h3>
          <ul className="grid gap-2.5">
            {total === undefined ? null : item(total > 0, t('games', { count: total, unsorted }))}
            {item(
              linked.length > 0,
              linked.length > 0
                ? t('linked', { platforms: linked.join(', ') })
                : t('nothingLinked'),
            )}
            {item(
              true,
              t('colors', {
                name: isPreset(colorway) ? colors(`presets.${colorway}.name`) : colors('own.name'),
              }),
            )}
            {item(
              true,
              t.rich(shelfPublic ? 'public' : 'private', {
                handle,
                change: (chunks) => (
                  <Link href="/settings/privacy" className={LINK}>
                    {chunks}
                  </Link>
                ),
              }),
            )}
          </ul>
        </section>
      </div>

      <section aria-labelledby="setup-next" className="grid gap-4">
        <h3 id="setup-next" className="title text-2xl">
          {t('next.title')}
        </h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {pc ? [desktop, filter, assistant] : [filter, assistant, desktop]}
        </div>
      </section>
    </div>
  )
}
