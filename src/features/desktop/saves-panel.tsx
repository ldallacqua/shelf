'use client'

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUploadIcon,
  FolderCheckIcon,
  FolderClockIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderSearchIcon,
  FolderXIcon,
  HardDriveDownloadIcon,
  HardDriveIcon,
  HardDriveUploadIcon,
  type LucideIcon,
  MonitorDownIcon,
  MonitorIcon,
  PlayIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react'

import type { Device } from '@/domain/library/devices'
import { callApi } from '@/features/owner/call-api'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { cn } from '@/ui/cn'
import { ConfirmInPlace } from '@/ui/confirm'
import { Dialog, DialogContent } from '@/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Ghost, GhostText, Loading } from '@/ui/ghost'
import { Progress } from '@/ui/progress'
import { Tip } from '@/ui/tooltip'

import { AppWords } from './app-words'
import { desktop } from './bridge'
import {
  folderRefusalOf,
  type SaveGame,
  type SaveProgress,
  type SavesView,
  type Snapshot,
  saves,
} from './saves'
import {
  type Destination,
  destinationOf,
  needsMe,
  type Standing,
  standingOf,
} from './saves-standing'
import { sizeOf } from './size'

const linkClass =
  'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** What the panel holds: the app's answer, or where it stands in asking. */
export type SavesState = 'loading' | 'failed' | SavesView

/** What is being done: one thing at a time, and what it is done to. */
export type SavesBusy =
  | 'turn'
  | 'back-up'
  | 'add'
  | 'game'
  | 'base'
  | `remove:${string}`
  | `restore:${string}`
  | `keep:${string}`

/** Said after something was done, at the top of the panel. */
export type SavesSaid = { tone: 'done' | 'trouble'; text: string }

/** The refusals a person has a sentence for; the rest are a plain failure. */
const sayable = [
  'running',
  'busy',
  'empty',
  'large',
  'wide',
  'game-folder',
  'outside',
  'missing',
  'damaged',
  'changed',
] as const
const refusalKey = (error: unknown) => {
  const { why } = folderRefusalOf(error)
  const refusal = sayable.find((each) => each === why) ?? 'failed'
  return refusal === 'game-folder' ? 'gameFolder' : refusal
}

const stores = ['steam', 'gog', 'epic', 'origin', 'uplay'] as const

type ViewProps = {
  title: string
  state: SavesState
  /** A snapshot's computer in words: this one, one of mine by its name, or another. */
  computerOf: (device: string | null) => string
  busy?: SavesBusy | undefined
  /** How far the backup or restore under way has got, when the app can say. */
  progress?: SaveProgress | null | undefined
  said?: SavesSaid | undefined
  onTurn: (on: boolean) => void
  onBackUp: () => void
  onRestore: (snapshot: Snapshot) => void
  onShow: (snapshot: Snapshot) => void
  onAdd: () => void
  onRemove: (location: string) => void
  onChooseGame: (title: string | null) => void
  onChooseBase: () => void
  /** Keeps this computer's copy (null) or one of the latest snapshots, when they differ. */
  onKeep: (snapshot: string | null) => void
  /**
   * Play opened it, as two copies differ (ADR 008, section 7): keeping one plays it, and the
   * person may play with what is here instead, deciding later.
   */
  beforePlay?: boolean
  onLater?: () => void
}

/**
 * A game's saves, in the app (ADR 008, spec 7.12), with what most people need first (ADR 009, decision
 * 5): whether they are safe, where, and what needs doing; then the switch, the latest backups, and where
 * the saves are, folded into one line. Drawn from what it is given: every state, for Storybook too.
 */
export function SavesPanelView(props: ViewProps) {
  const t = useTranslations('Saves')
  const { state, said } = props
  return (
    <div className="grid gap-6">
      {said ? (
        <p
          role={said.tone === 'trouble' ? 'alert' : 'status'}
          className={
            said.tone === 'trouble'
              ? 'rounded-control border border-line-strong px-4 py-3 text-sm text-pretty'
              : 'text-sm text-pretty text-muted'
          }
        >
          {said.text}
        </p>
      ) : null}
      {state === 'loading' ? (
        <Loading label={t('loading')} className="grid gap-6">
          <span className={cn(leadBox, 'border-line')}>
            <GhostText className="w-4/5 text-sm" />
            <Ghost className="h-8 w-32" />
          </span>
          <span className="flex items-center gap-3">
            <Ghost className="h-6 w-10 rounded-full" />
            <GhostText className="w-56 text-sm" />
          </span>
          {[0, 1, 2].map((row) => (
            <GhostText key={row} order={row} className="w-3/5 text-sm" />
          ))}
        </Loading>
      ) : state === 'failed' ? (
        <p role="alert" className="rounded-control border border-line-strong px-4 py-3 text-sm">
          {t('refusal.failed')}
        </p>
      ) : (
        <Ready {...props} view={state} />
      )}
    </div>
  )
}

/** Whether a backup or a restore is under way, which has a bar of its own. */
const moving = (busy: SavesBusy | undefined) =>
  busy === 'back-up' || busy?.startsWith('restore:') === true || busy?.startsWith('keep:') === true

/** The box the first answer stands in. */
const leadBox = 'grid justify-items-start gap-3 rounded-panel border p-4'

/** How long ago, as a person says it, in a sentence or, `narrow`, beside Play; a moment is "just now". */
function useAgo() {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  return (at: number, style: 'long' | 'narrow' = 'long') =>
    now.getTime() - at < 60_000
      ? t('justNow')
      : format.relativeTime(Math.min(at, now.getTime()), { now, style })
}

/** How far a backup or restore has got, said and drawn, in place of a button merely greyed out. */
function SavingProgress({
  busy,
  progress,
  place,
}: {
  busy: SavesBusy | undefined
  progress: SaveProgress | null | undefined
  place: string | null
}) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const share = progress && progress.total ? Math.min(1, progress.done / progress.total) : undefined
  // Before the app has said, or an app too old to say: what the button says.
  const label = progress
    ? t(`progress.${progress.step}`, { place: place ?? '' })
    : busy === 'back-up'
      ? t('backingUp')
      : t('restoring')
  return (
    <div className="grid gap-1.5 rounded-panel border border-line p-4">
      <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
        <span aria-live="polite">{label}</span>
        {share === undefined ? null : (
          <span className="tabular-nums">{format.number(share, { style: 'percent' })}</span>
        )}
      </p>
      <Progress
        aria-label={label}
        value={share === undefined ? undefined : Math.round(share * 100)}
        max={share === undefined ? undefined : 100}
      />
    </div>
  )
}

function Ready(props: ViewProps & { view: SavesView }) {
  const { view, busy, onTurn } = props
  const t = useTranslations('Saves')
  const format = useFormatter()
  const id = useId()
  const carried = view.cloud
    .map((store) => stores.find((each) => each === store))
    .filter((store) => store !== undefined)
    .map((store) => t(`stores.${store}`))

  return (
    <>
      <Lead {...props} standing={standingOf(view)} />
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <Switch
            id={id}
            checked={view.on}
            disabled={busy !== undefined}
            {...(view.on ? {} : { 'aria-describedby': `${id}-intro` })}
            onChange={(event) => onTurn(event.target.checked)}
          />
          <label htmlFor={id} className="text-sm font-medium">
            {t('switch')}
          </label>
        </div>
        {/* What it does is said while it is off: once on, the answer above says it. */}
        {view.on ? null : (
          <>
            <p id={`${id}-intro`} className="text-sm text-pretty text-muted">
              {t('intro')}
            </p>
            {carried.length > 0 ? (
              <p className="text-sm text-pretty text-muted">
                {t('cloud', { stores: format.list(carried, { type: 'conjunction' }) })}
              </p>
            ) : null}
          </>
        )}
      </div>
      {view.on || view.snapshots.length > 0 ? <History {...props} /> : null}
      <Where {...props} />
    </>
  )
}

/**
 * The first answer: one sentence with where and when, and the one action that fits it. A choice and
 * newer saves have their own; while a backup or restore runs, its bar stands here instead.
 */
/** A standing's mark: where the saves are, or a warning when it needs the person. */
function markOf(standing: Standing, className?: string) {
  const props = { 'aria-hidden': true, className }
  switch (standing.kind) {
    case 'setup':
      return <FolderSearchIcon {...props} />
    case 'choose':
    case 'signed-out':
    case 'full':
      return <TriangleAlertIcon {...props} />
    case 'behind':
      return <MonitorDownIcon {...props} />
    case 'kept':
      return standing.to.kind === 'here' ? (
        <HardDriveIcon {...props} />
      ) : standing.to.kind === 'folder' ? (
        <FolderCheckIcon {...props} />
      ) : (
        <CloudCheckIcon {...props} />
      )
    case 'waiting':
      return standing.to.kind === 'folder' ? (
        <FolderClockIcon {...props} />
      ) : (
        <CloudUploadIcon {...props} />
      )
    case 'unreachable':
      return standing.to.kind === 'folder' ? (
        <FolderXIcon {...props} />
      ) : (
        <CloudOffIcon {...props} />
      )
    default:
      return <HardDriveIcon {...props} />
  }
}

function Lead({
  view,
  standing,
  computerOf,
  busy,
  progress,
  onBackUp,
  onRestore,
  onKeep,
  beforePlay,
  onLater,
}: ViewProps & { view: SavesView; standing: Standing }) {
  const t = useTranslations('Saves')
  const ago = useAgo()
  if (moving(busy)) return <SavingProgress busy={busy} progress={progress} place={view.place} />
  if (standing.kind === 'off') return null
  if (standing.kind === 'choose') {
    return (
      <Choice
        view={view}
        computerOf={computerOf}
        busy={busy}
        onKeep={onKeep}
        beforePlay={beforePlay}
        onLater={onLater}
      />
    )
  }
  if (standing.kind === 'behind') {
    return (
      <Behind newer={standing.newer} computerOf={computerOf} busy={busy} onRestore={onRestore} />
    )
  }

  const backUp = (primary = false) => (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size="sm"
      disabled={busy !== undefined || view.files === 0}
      onClick={onBackUp}
    >
      <HardDriveUploadIcon aria-hidden="true" />
      {busy === 'back-up' ? t('backingUp') : t('backUp')}
    </Button>
  )
  const toSettings = (words: string) => (
    <Button asChild variant="secondary" size="sm">
      <Link href="/settings/saves">{words}</Link>
    </Button>
  )
  const to = standing.kind === 'setup' ? undefined : standing.to
  const place = to?.kind === 'service' ? to.name : to?.kind === 'folder' ? to.path : ''
  const folder = to?.kind === 'folder'

  let sentence: string
  let actions: ReactNode = backUp()
  switch (standing.kind) {
    case 'setup':
      sentence = t('lead.setup')
      // Its folder is the task, and "Where they are" is open below, with Add a folder.
      actions = null
      break
    case 'kept':
      if (standing.to.kind === 'here') {
        sentence = t('lead.keptHere', { ago: ago(standing.at) })
        actions = (
          <>
            {backUp()}
            <Link href="/settings/saves" className={linkClass}>
              {t('lead.onlyHere')}
            </Link>
          </>
        )
      } else {
        sentence = folder
          ? t('lead.keptFolder', { ago: ago(standing.at) })
          : t('lead.kept', { place, ago: ago(standing.at) })
      }
      break
    case 'waiting':
      sentence = folder
        ? t('lead.waitingFolder', { ago: ago(standing.at) })
        : t('lead.waiting', { place, ago: ago(standing.at) })
      break
    case 'changed':
      sentence =
        standing.at === undefined
          ? t('lead.changedFirst')
          : t('lead.changed', { ago: ago(standing.at) })
      actions = backUp(true)
      break
    case 'unreachable':
      sentence = folder ? t('lead.unreachableFolder') : t('lead.unreachable', { place })
      break
    case 'signed-out':
      sentence = t('lead.signedOut', { place })
      actions = (
        <>
          {toSettings(t('lead.signIn'))}
          {backUp()}
        </>
      )
      break
    case 'full':
      sentence = t('lead.full', { place })
      actions = (
        <>
          {toSettings(t('lead.elsewhere'))}
          {backUp()}
        </>
      )
      break
  }
  const warning = needsMe(standing)
  return (
    <div className={cn(leadBox, warning ? 'border-line-strong' : 'border-line')}>
      <p className="flex items-start gap-2.5 text-sm text-pretty">
        {markOf(standing, cn('mt-0.5 size-4 flex-none', warning ? 'text-accent' : 'text-muted'))}
        <span className="grid min-w-0 gap-0.5">
          <span aria-live="polite" className={warning ? 'font-medium' : undefined}>
            {sentence}
          </span>
          {/* The folder itself, where its name is the destination. */}
          {folder ? <span className="text-xs break-all text-muted">{place}</span> : null}
        </span>
      </p>
      {actions ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** Saves newer than these: another computer's, or from before the saves here went. */
function Behind({
  newer,
  computerOf,
  busy,
  onRestore,
}: {
  newer: Snapshot
  computerOf: (device: string | null) => string
  busy?: SavesBusy | undefined
  onRestore: (snapshot: Snapshot) => void
}) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const when = madeAt(format, newer.createdAt)
  // What is here is what this computer last backed up or brought, unchanged since: taking the newer
  // one loses nothing, so it is never asked, as Steam takes the cloud's newer files before a game
  // starts. Play does it by itself; the button is for a game started from somewhere else.
  return (
    <div className={cn(leadBox, 'border-line-strong')}>
      <p className="flex items-start gap-2.5 text-sm text-pretty">
        <MonitorDownIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-accent" />
        <span aria-live="polite" className="font-medium">
          {t('behind', { computer: computerOf(newer.device), when })}
        </span>
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="justify-self-start"
        disabled={busy !== undefined}
        onClick={() => onRestore(newer)}
      >
        {busy === `restore:${newer.id}` ? t('restoring') : t('restoreNewer')}
      </Button>
    </div>
  )
}

/** When a backup was made, as a person says it: the day and the time. */
export const madeAt = (format: ReturnType<typeof useFormatter>, at: number) =>
  format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short' })

/** The newest backups shown before "All": as many as a glance takes in. */
const LATEST = 3

/** The backups, newest first: the latest few, the rest one press away. */
function History({
  title,
  view,
  computerOf,
  busy,
  onRestore,
  onShow,
}: ViewProps & { view: SavesView }) {
  const t = useTranslations('Saves')
  const id = useId()
  const [all, setAll] = useState(false)
  const shown = all ? view.snapshots : view.snapshots.slice(0, LATEST)
  const to = destinationOf(view)
  return (
    <section aria-labelledby={`${id}-history`} className="grid gap-3">
      <h3 id={`${id}-history`} className="text-sm font-medium">
        {t('history')}
      </h3>
      {view.snapshots.length === 0 ? (
        <p className="text-sm text-muted">{t('noneYet')}</p>
      ) : (
        <ol id={`${id}-list`} className="grid gap-2">
          {shown.map((snapshot) => (
            <SnapshotRow
              key={snapshot.id}
              title={title}
              snapshot={snapshot}
              computer={computerOf(snapshot.device)}
              to={to}
              busy={busy}
              onRestore={() => onRestore(snapshot)}
              onShow={() => onShow(snapshot)}
            />
          ))}
        </ol>
      )}
      {view.snapshots.length > LATEST ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-mx-3"
            aria-expanded={all}
            aria-controls={`${id}-list`}
            onClick={() => setAll(!all)}
          >
            <ChevronDownIcon
              aria-hidden="true"
              className={cn('transition-transform duration-quick ease-settle', all && 'rotate-180')}
            />
            {t('all', { count: view.snapshots.length })}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/** A mark on a backup's row: an icon whose words are a tip, and what a screen reader hears. */
function Mark({ icon: Icon, label, words }: { icon: LucideIcon; label: string; words?: string }) {
  return (
    <Tip label={label}>
      <span className="flex items-center gap-1 text-xs text-muted">
        <Icon aria-hidden="true" className="size-3.5" />
        {/* Waiting is said in words too: it is the one that may need something. */}
        {words ? (
          <span aria-hidden="true" className="font-medium text-text">
            {words}
          </span>
        ) : null}
        <span className="sr-only">{label}</span>
      </span>
    </Tip>
  )
}

/** Whether a backup is on this computer now, and whether it is at the place yet or waiting here. */
function Marks({ snapshot, to }: { snapshot: Snapshot; to: Destination }) {
  const t = useTranslations('Saves')
  const there =
    // This computer alone, or an app too old to say.
    to.kind === 'here' || snapshot.waiting === undefined ? null : to.kind === 'service' ? (
      snapshot.waiting ? (
        <Mark
          icon={CloudUploadIcon}
          label={t('notInService', { service: to.name })}
          words={t('waitingMark')}
        />
      ) : (
        <Mark icon={CloudCheckIcon} label={t('inService', { service: to.name })} />
      )
    ) : snapshot.waiting ? (
      <Mark icon={FolderClockIcon} label={t('notInFolder')} words={t('waitingMark')} />
    ) : (
      <Mark icon={FolderCheckIcon} label={t('inFolder')} />
    )
  return (
    <span className="flex flex-none items-center gap-2">
      {snapshot.here ? <Mark icon={CheckIcon} label={t('hereNow')} /> : null}
      {there}
    </span>
  )
}

function SnapshotRow({
  title,
  snapshot,
  computer,
  to,
  busy,
  onRestore,
  onShow,
}: {
  title: string
  snapshot: Snapshot
  computer: string
  to: Destination
  busy?: SavesBusy | undefined
  onRestore: () => void
  onShow: () => void
}) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const when = madeAt(format, snapshot.createdAt)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line px-3 py-2">
      <span className="min-w-0 flex-1 text-sm">
        {t.rich('row', {
          when,
          computer,
          time: (chunks) => (
            <time dateTime={new Date(snapshot.createdAt).toISOString()}>{chunks}</time>
          ),
          muted: (chunks) => <span className="text-muted">{chunks}</span>,
        })}
      </span>
      <Marks snapshot={snapshot} to={to} />
      <Tip label={t('show', { when })}>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label={t('show', { when })}
          onClick={onShow}
        >
          <FolderOpenIcon aria-hidden="true" />
        </Button>
      </Tip>
      {/* Last in the row, so its question opens under the row, in the order focus takes. */}
      {snapshot.here ? null : (
        <ConfirmInPlace
          title={t('restoreTitle', { when })}
          description={t('restoreBody', { title })}
          confirm={t('restore')}
          cancel={t('cancel')}
          onConfirm={onRestore}
          className="basis-full"
        >
          <Button variant="secondary" size="sm" disabled={busy !== undefined}>
            {busy === `restore:${snapshot.id}` ? t('restoring') : t('restore')}
          </Button>
        </ConfirmInPlace>
      )}
    </li>
  )
}

/**
 * Where the saves are, folded into one line: how many folders, files and bytes. Opened, everything to
 * find them, change them and credit the list. It opens by itself when nothing usable is found, as then
 * finding them is the task.
 */
function Where({
  view,
  busy,
  onAdd,
  onRemove,
  onChooseGame,
  onChooseBase,
}: ViewProps & { view: SavesView }) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  // A place the list names with nothing there now is counted, not listed: most games name several.
  const shown = view.locations.filter((each) => each.added || each.files > 0 || each.refused)
  const quiet = view.locations.length - shown.length
  const usable = view.locations.filter((each) => !each.refused && each.files > 0)
  const found = usable.length > 0
  const [open, setOpen] = useState(!found)
  const [wasFound, setWasFound] = useState(found)
  if (wasFound !== found) {
    setWasFound(found)
    if (!found) setOpen(true)
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/where border-t border-line pt-1"
    >
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 flex-none text-muted transition-transform duration-quick ease-settle group-open/where:rotate-90"
        />
        <span className="font-medium">{t('where')}</span>
        <span className="text-muted">
          {found
            ? t('whereSummary', {
                folders: usable.length,
                files: view.files,
                size: sizeOf(format, view.bytes),
              })
            : t('whereNone')}
        </span>
        <span aria-hidden="true" className={cn(linkClass, 'ml-auto group-open/where:hidden')}>
          {t('whereChange')}
        </span>
      </summary>
      {open ? (
        <div className="grid gap-3 pt-1 pb-1 pl-6">
          {!view.manifest ? (
            <p className="text-sm text-pretty text-muted">{t('noList')}</p>
          ) : view.matched === null ? (
            <p className="text-sm text-pretty text-muted">{t('unknownGame')}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm text-pretty text-muted">
                {t('foundAs', { name: view.matched })}
              </p>
              {view.others.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy !== undefined}>
                      {t('notThis')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-w-80">
                    {view.others.map((other) => (
                      <DropdownMenuItem key={other} onSelect={() => onChooseGame(other)}>
                        {other}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onChooseGame(null)}>
                      {t('firstFound')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          )}
          {shown.length > 0 ? (
            <ul className="grid gap-2">
              {shown.map((location) => (
                <li
                  key={location.text}
                  className="flex items-start gap-3 rounded-control border border-line px-3 py-2"
                >
                  <FolderIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm break-all">{location.shown}</span>
                    <span className="text-xs text-muted">
                      {location.refused
                        ? t('refused')
                        : location.files === 0
                          ? t('nothingThere')
                          : t('files', {
                              files: location.files,
                              size: sizeOf(format, location.bytes),
                            })}
                    </span>
                  </span>
                  <Tip label={t('leaveOut', { path: location.shown })}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-my-1 px-2"
                      aria-label={t('leaveOut', { path: location.shown })}
                      disabled={busy !== undefined}
                      onClick={() => onRemove(location.text)}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </Tip>
                </li>
              ))}
            </ul>
          ) : null}
          {quiet > 0 ? <p className="text-xs text-muted">{t('quiet', { count: quiet })}</p> : null}
          {view.registry ? <p className="text-sm text-pretty text-muted">{t('registry')}</p> : null}
          <div>
            <Button variant="secondary" size="sm" disabled={busy !== undefined} onClick={onAdd}>
              <FolderPlusIcon aria-hidden="true" />
              {t('add')}
            </Button>
          </div>
          {shown.length === 0 ? (
            <p className="text-xs text-pretty text-muted">{t('hiddenFolders')}</p>
          ) : null}
          {view.base ? (
            <dl className="grid gap-0.5 text-xs">
              <dt className="text-muted">{t('gameFolder')}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span className="break-all">{view.base}</span>
                <button
                  type="button"
                  className={linkClass}
                  disabled={busy !== undefined}
                  onClick={onChooseBase}
                >
                  {t('changeGameFolder')}
                </button>
              </dd>
            </dl>
          ) : null}
          <p className="text-xs text-pretty text-muted">
            {t.rich('credit', {
              wiki: (chunks) => (
                <a
                  href="https://www.pcgamingwiki.com/"
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  {chunks}
                </a>
              ),
              manifest: (chunks) => (
                <a
                  href="https://github.com/mtkennerly/ludusavi-manifest"
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      ) : null}
    </details>
  )
}

/** The copies a choice is between, as cards: this computer's, if it differs, and each latest snapshot. */
function Choice({
  view,
  computerOf,
  busy,
  onKeep,
  beforePlay,
  onLater,
}: {
  view: SavesView
  computerOf: (device: string | null) => string
  busy?: SavesBusy | undefined
  onKeep: (snapshot: string | null) => void
  beforePlay?: boolean | undefined
  onLater?: (() => void) | undefined
}) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const id = useId()
  const heads = view.snapshots.filter((snapshot) => view.heads.includes(snapshot.id))
  // What is here is one of the latest already: it needs no card of its own.
  const here = view.files > 0 && !heads.some((snapshot) => snapshot.here)
  const keep = (key: string | null) => (
    <Button variant="secondary" size="sm" disabled={busy !== undefined} onClick={() => onKeep(key)}>
      {busy === `keep:${key ?? 'here'}`
        ? t('choice.keeping')
        : beforePlay
          ? t('choice.keepAndPlay')
          : t('choice.keep')}
    </Button>
  )
  return (
    <section
      aria-labelledby={`${id}-choice`}
      className="grid gap-3 rounded-panel border border-line-strong p-4"
    >
      <h3 id={`${id}-choice`} className="flex items-center gap-2 text-sm font-medium">
        <TriangleAlertIcon aria-hidden="true" className="size-4 text-accent" />
        {beforePlay ? t('choice.playTitle') : t('choice.title')}
      </h3>
      <p className="text-sm text-pretty text-muted">{t('choice.body')}</p>
      <ul className="grid gap-2">
        {here ? (
          <li className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
            <MonitorIcon aria-hidden="true" className="size-4 flex-none text-muted" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium">{t('choice.here')}</span>
              <span className="text-xs text-muted">
                {view.changedAt === null
                  ? t('files', { files: view.files, size: sizeOf(format, view.bytes) })
                  : t('choice.changed', {
                      when: madeAt(format, view.changedAt),
                      files: view.files,
                      size: sizeOf(format, view.bytes),
                    })}
              </span>
            </span>
            {keep(null)}
          </li>
        ) : null}
        {heads.map((snapshot) => (
          <li
            key={snapshot.id}
            className="flex items-center gap-3 rounded-control border border-line px-3 py-2"
          >
            <HardDriveDownloadIcon aria-hidden="true" className="size-4 flex-none text-muted" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium">{computerOf(snapshot.device)}</span>
              <span className="text-xs text-muted">
                {t('choice.backedUp', {
                  when: madeAt(format, snapshot.createdAt),
                  files: snapshot.files,
                  size: sizeOf(format, snapshot.bytes),
                })}
              </span>
            </span>
            {keep(snapshot.id)}
          </li>
        ))}
      </ul>
      {beforePlay && onLater ? (
        <div className="grid justify-items-start gap-1 border-t border-line pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="-mx-3"
            disabled={busy !== undefined}
            aria-describedby={`${id}-later`}
            onClick={onLater}
          >
            <PlayIcon aria-hidden="true" />
            {t('choice.later')}
          </Button>
          <p id={`${id}-later`} className="text-xs text-pretty text-muted">
            {t('choice.laterBody')}
          </p>
        </div>
      ) : null}
    </section>
  )
}

/** My computers, as Shelf names them, and which one this is. */
function useComputers() {
  const tComputer = useTranslations('ThisComputer')
  const t = useTranslations('Saves')
  const [known, setKnown] = useState<{ here?: string; devices: Device[] }>({ devices: [] })
  useEffect(() => {
    let current = true
    void Promise.all([
      desktop.info().catch(() => undefined),
      callApi<{ devices: Device[] }>('GET', '/api/v1/me/devices'),
    ]).then(([info, answer]) => {
      if (!current) return
      setKnown({
        ...(info?.device ? { here: info.device } : {}),
        devices: answer.ok ? answer.value.devices : [],
      })
    })
    return () => {
      current = false
    }
  }, [])
  return useCallback(
    (device: string | null) => {
      if (device !== null && device === known.here) return t('thisComputer')
      const named = known.devices.find((each) => each.id === device)
      if (!named) return t('anotherComputer')
      return named.name ?? tComputer('unnamed', { number: named.number })
    },
    [known, t, tComputer],
  )
}

/**
 * The latest answer about each game's saves, whoever asked: the dialog, or the status beside Play. Each
 * shows what the other last read, so the status follows what was done in the dialog without asking again.
 */
const latest = new Map<string, SavesView | 'failed'>()
const listeners = new Set<() => void>()
const publish = (entryId: string, view: SavesView | 'failed') => {
  latest.set(entryId, view)
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The dialog's insides, asking the app: read when it opens, and after everything done. */
function SavesBody({ game, onPlay }: { game: SaveGame; onPlay?: (check: boolean) => void }) {
  const { entryId, title, apps } = game
  const t = useTranslations('Saves')
  const format = useFormatter()
  const computerOf = useComputers()
  const [state, setShown] = useState<SavesState>('loading')
  const setState = (next: SavesView | 'failed') => {
    setShown(next)
    publish(entryId, next)
  }
  const [busy, setBusy] = useState<SavesBusy>()
  const [said, setSaid] = useState<SavesSaid>()
  const [progress, setProgress] = useState<SaveProgress | null>(null)
  const key = apps.join(' ')
  const going = moving(busy)

  // While a backup or restore is under way, the app is asked how far it has got.
  useEffect(() => {
    if (!going) return
    let current = true
    const look = () =>
      saves.progress(entryId).then(
        (now) => current && setProgress(now),
        // An app too old to say: the bar only moves.
        () => undefined,
      )
    void look()
    const timer = setInterval(() => void look(), 200)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [going, entryId])

  /** What a refusal says: a folder Windows handed over is named, as it is not always the one meant. */
  const sentence = (error: unknown, doing?: SavesBusy) => {
    const { why, folder } = folderRefusalOf(error)
    if (folder !== undefined && (why === 'wide' || why === 'game-folder' || why === 'outside')) {
      const named =
        why === 'game-folder' ? 'gameFolder' : why === 'wide' && doing === 'base' ? 'wideGame' : why
      return t(`named.${named}`, { folder })
    }
    return t(`refusal.${refusalKey(error)}`, { title })
  }

  useEffect(() => {
    let current = true
    saves
      .view({ entryId, title, apps: key === '' ? [] : key.split(' ') })
      .catch((): 'failed' => 'failed')
      .then((view) => {
        if (!current) return
        setShown(view)
        publish(entryId, view)
      })
    return () => {
      current = false
    }
  }, [entryId, title, key])

  /** Does one thing; whether it was done. */
  const run = async (
    doing: SavesBusy,
    work: () => Promise<SavesView | null>,
    done?: (view: SavesView) => string | undefined,
  ) => {
    setBusy(doing)
    setSaid(undefined)
    setProgress(null)
    let worked = false
    try {
      const view = await work()
      // Null: Windows' picker was closed, which changes nothing.
      if (view) {
        setState(view)
        const text = done?.(view)
        if (text) setSaid({ tone: 'done', text })
        worked = true
      }
    } catch (error) {
      setSaid({ tone: 'trouble', text: sentence(error, doing) })
    }
    setBusy(undefined)
    return worked
  }

  return (
    <SavesPanelView
      title={title}
      state={state}
      computerOf={computerOf}
      busy={busy}
      progress={progress}
      said={said}
      onTurn={(on) => void run('turn', () => saves.turn(game, on))}
      onBackUp={() =>
        void run(
          'back-up',
          () => saves.backUp(game),
          (view) =>
            view.last?.did === 'unchanged'
              ? t('unchanged')
              : view.last?.did === 'waiting'
                ? t('waiting')
                : t('backedUp'),
        )
      }
      onRestore={(snapshot) =>
        void run(
          `restore:${snapshot.id}`,
          () => saves.restore(game, snapshot.id),
          () => t('restored', { when: madeAt(format, snapshot.createdAt) }),
        )
      }
      onShow={(snapshot) => {
        saves.show(entryId, snapshot.id).catch((error: unknown) => {
          setSaid({ tone: 'trouble', text: t(`refusal.${refusalKey(error)}`, { title }) })
        })
      }}
      onAdd={() => void run('add', () => saves.addFolder(game, t('addTitle', { title })))}
      onRemove={(location) =>
        void run(`remove:${location}`, () => saves.removeLocation(game, location))
      }
      onChooseGame={(chosen) => void run('game', () => saves.chooseGame(game, chosen))}
      onChooseBase={() =>
        void run('base', () => saves.chooseGameFolder(game, t('gameFolderTitle', { title })))
      }
      onKeep={(snapshot) =>
        void run(
          `keep:${snapshot ?? 'here'}`,
          () => saves.keep(game, snapshot),
          () => t('choice.kept'),
        ).then((kept) => {
          // Opened by Play: what was kept is played, looked at once more on the way.
          if (kept) onPlay?.(true)
        })
      }
      {...(onPlay ? { beforePlay: true, onLater: () => onPlay(false) } : {})}
    />
  )
}

type SavesPanelProps = SaveGame & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes when it closes: the menu's item, or the notice, that opened it may have gone. */
  returnFocus: ComponentProps<typeof DialogContent>['returnFocus']
  /**
   * Given when Play opened it, as two copies differ: plays the game once one is kept (`check`
   * true), or with what is here when the person decides later (false).
   */
  onPlay?: ((check: boolean) => void) | undefined
}

function Frame({
  title,
  open,
  onOpenChange,
  returnFocus,
  children,
}: Omit<SavesPanelProps, 'entryId' | 'apps' | 'onPlay'> & { children: ReactNode }) {
  const t = useTranslations('Saves')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('title', { title })}
        closeLabel={t('close')}
        returnFocus={returnFocus}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

/**
 * A game's saves (ADR 008), opened from Play's menu, in the app alone. Read each time it opens, so what
 * another window or the tray changed is there.
 */
export default function SavesPanel({ entryId, title, apps, onPlay, ...frame }: SavesPanelProps) {
  return (
    <AppWords>
      <Frame title={title} {...frame}>
        {frame.open ? (
          <SavesBody game={{ entryId, title, apps }} {...(onPlay ? { onPlay } : {})} />
        ) : null}
      </Frame>
    </AppWords>
  )
}

/** Its place in Play's menu, with its own words, which come with this code and not with the page. */
export function SavesItem({ onOpen }: { onOpen: () => void }) {
  return (
    <AppWords>
      <ItemWords onOpen={onOpen} />
    </AppWords>
  )
}

function ItemWords({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('Saves')
  return (
    <DropdownMenuItem onSelect={onOpen}>
      <HardDriveDownloadIcon aria-hidden="true" />
      {t('open')}
    </DropdownMenuItem>
  )
}

type StatusProps = SaveGame & {
  /** Its saves are being synced now: Play says so, and the answer is read again once it is done. */
  syncing: boolean
  /** Opens the Saves dialog, handing it the button, for focus to come back to. */
  onOpen: (from: HTMLElement) => void
}

/**
 * Beside Play, once a game's saves are on (ADR 009, decision 5): their state in a few words, as Steam's
 * Cloud status, opening the Saves dialog. Read once when the page shows it and again after each sync,
 * never on a timer: reading lists the place's backups, which may be a service's.
 */
export function SavesStatus(props: StatusProps) {
  return (
    <AppWords>
      <Status {...props} />
    </AppWords>
  )
}

function Status({ entryId, title, apps, syncing, onOpen }: StatusProps) {
  const view = useSyncExternalStore(
    subscribe,
    () => latest.get(entryId),
    () => undefined,
  )
  const key = apps.join(' ')
  useEffect(() => {
    if (syncing) return
    let current = true
    saves.view({ entryId, title, apps: key === '' ? [] : key.split(' ') }).then(
      (answer) => current && publish(entryId, answer),
      () => current && publish(entryId, 'failed'),
    )
    return () => {
      current = false
    }
  }, [entryId, title, key, syncing])

  return <SavesStatusView view={view} syncing={syncing} onOpen={onOpen} />
}

/** The status's two lines: "Saves" as the page writes a label, and the state under it. */
const statLabel = 'readout text-[0.625rem] text-muted'

/**
 * The status's button, drawn from what it is given: the latest answer (none yet, or a failed read), and
 * whether a sync runs. Every state, for Storybook too. It reads as one of Steam's play bar figures,
 * "Cloud status" over "Up to date": a label in the page's small capitals, and the state in words.
 */
export function SavesStatusView({
  view,
  syncing,
  onOpen,
}: {
  view: SavesView | 'failed' | undefined
  syncing: boolean
  onOpen: (from: HTMLElement) => void
}) {
  const t = useTranslations('Saves')
  const ago = useAgo()
  if (view === undefined) {
    return (
      <Loading label={t('status.loading')}>
        <span className="grid gap-1 px-2">
          <span className={statLabel}>{t('status.label')}</span>
          <Ghost className="h-4 w-40" />
        </span>
      </Loading>
    )
  }
  const standing = view === 'failed' ? undefined : standingOf(view)
  if (standing?.kind === 'off') return null
  const warning = standing === undefined || needsMe(standing)
  const place = (to: Destination) =>
    to.kind === 'service' ? to.name : to.kind === 'folder' ? to.path : ''
  const words = syncing
    ? t('status.syncing')
    : standing === undefined
      ? t('status.failed')
      : standing.kind === 'kept'
        ? standing.to.kind === 'here'
          ? t('status.keptHere', { ago: ago(standing.at, 'narrow') })
          : standing.to.kind === 'folder'
            ? t('status.keptFolder', { ago: ago(standing.at, 'narrow') })
            : t('status.kept', { place: place(standing.to), ago: ago(standing.at, 'narrow') })
        : standing.kind === 'behind'
          ? standing.to.kind === 'service'
            ? t('status.behind', {
                place: place(standing.to),
                ago: ago(standing.newer.createdAt, 'narrow'),
              })
            : t('status.behindFolder', { ago: ago(standing.newer.createdAt, 'narrow') })
          : standing.kind === 'signed-out'
            ? t('status.signedOut', { place: place(standing.to) })
            : standing.kind === 'full'
              ? t('status.full', { place: place(standing.to) })
              : standing.kind === 'unreachable'
                ? t('status.waiting')
                : t(`status.${standing.kind}`)
  return (
    <Button
      variant="ghost"
      aria-haspopup="dialog"
      // Read as one, "Saves: Google Drive · 19h ago": browsers join two lines' words each their own way.
      aria-label={t('status.named', { state: words })}
      // Two lines as tall as Play beside it, the label over the state, as far left as Play's words.
      className="h-auto min-h-10 max-w-72 min-w-0 flex-col items-start gap-0.5 px-2 py-1 text-left pointer-coarse:h-auto pointer-coarse:min-h-11"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className={statLabel}>{t('status.label')}</span>
      <span
        className={cn(
          'flex max-w-full min-w-0 items-center gap-1.5 font-normal',
          warning ? 'text-text' : 'text-muted',
        )}
      >
        {syncing ? (
          <RefreshCwIcon aria-hidden="true" />
        ) : standing ? (
          markOf(standing, warning ? 'text-accent' : undefined)
        ) : (
          <TriangleAlertIcon aria-hidden="true" className="text-accent" />
        )}
        <span className="truncate">{words}</span>
      </span>
    </Button>
  )
}
