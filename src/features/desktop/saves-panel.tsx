'use client'

import {
  CheckIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HardDriveDownloadIcon,
  XIcon,
} from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useState } from 'react'

import type { Device } from '@/domain/library/devices'
import { callApi } from '@/features/owner/call-api'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { Confirm } from '@/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Ghost, GhostText, Loading } from '@/ui/ghost'
import { Tip } from '@/ui/tooltip'

import { AppWords } from './app-words'
import { BesidePlay } from './beside-play'
import { desktop } from './bridge'
import { type SaveGame, type SavesView, type Snapshot, saveRefusalOf, saves } from './saves'
import { sizeOf } from './size'

const linkClass =
  'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** What the panel holds: the app's answer, or where it stands in asking. */
export type SavesState = 'loading' | 'failed' | SavesView

/** What is being done: one thing at a time, and what it is done to. */
export type SavesBusy =
  'turn' | 'back-up' | 'add' | 'game' | 'base' | `remove:${string}` | `restore:${string}`

/** Said after something was done, at the top of the panel. */
export type SavesSaid = { tone: 'done' | 'trouble'; text: string }

/** The refusals a person has a sentence for; the rest are a plain failure. */
const sayable = [
  'running',
  'busy',
  'empty',
  'large',
  'wide',
  'outside',
  'missing',
  'damaged',
  'changed',
] as const
const refusalKey = (error: unknown) => {
  const refusal = saveRefusalOf(error)
  return sayable.find((each) => each === refusal) ?? 'failed'
}

const stores = ['steam', 'gog', 'epic', 'origin', 'uplay'] as const

type ViewProps = {
  title: string
  state: SavesState
  /** A snapshot's computer in words: this one, one of mine by its name, or another. */
  computerOf: (device: string | null) => string
  busy?: SavesBusy | undefined
  said?: SavesSaid | undefined
  onTurn: (on: boolean) => void
  onBackUp: () => void
  onRestore: (snapshot: Snapshot) => void
  onShow: (snapshot: Snapshot) => void
  onAdd: () => void
  onRemove: (location: string) => void
  onChooseGame: (title: string | null) => void
  onChooseBase: () => void
}

/**
 * A game's saves, in the app (ADR 008, spec 7.12): whether they are backed up, where they were found,
 * and their snapshots, each one restorable. Drawn from what it is given: every state, for Storybook too.
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
          <span className="flex items-center gap-3">
            <Ghost className="h-6 w-10 rounded-full" />
            <GhostText className="w-56 text-sm" />
          </span>
          {[0, 1, 2].map((row) => (
            <span key={row} className="grid gap-1">
              <GhostText order={row} className="w-4/5 text-sm" />
              <GhostText order={row} className="w-2/5 text-xs" />
            </span>
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

function Ready({
  title,
  view,
  computerOf,
  busy,
  onTurn,
  onBackUp,
  onRestore,
  onShow,
  onAdd,
  onRemove,
  onChooseGame,
  onChooseBase,
}: ViewProps & { view: SavesView }) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const id = useId()
  const carried = view.cloud
    .map((store) => stores.find((each) => each === store))
    .filter((store) => store !== undefined)
    .map((store) => t(`stores.${store}`))
  // A place the list names with nothing there now is counted, not listed: most games name several.
  const shown = view.locations.filter((each) => each.added || each.files > 0 || each.refused)
  const quiet = view.locations.length - shown.length

  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <Switch
            id={id}
            checked={view.on}
            disabled={busy !== undefined}
            aria-describedby={`${id}-intro`}
            onChange={(event) => onTurn(event.target.checked)}
          />
          <label htmlFor={id} className="text-sm font-medium">
            {t('switch')}
          </label>
        </div>
        <p id={`${id}-intro`} className="text-sm text-pretty text-muted">
          {t('intro')}
        </p>
        {carried.length > 0 ? (
          <p className="text-sm text-pretty text-muted">
            {t('cloud', { stores: format.list(carried, { type: 'conjunction' }) })}
          </p>
        ) : null}
      </div>

      <section aria-labelledby={`${id}-where`} className="grid gap-3">
        <h3 id={`${id}-where`} className="text-sm font-medium">
          {t('where')}
        </h3>
        {!view.manifest ? (
          <p className="text-sm text-pretty text-muted">{t('noList')}</p>
        ) : view.matched === null ? (
          <p className="text-sm text-pretty text-muted">{t('unknownGame')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-pretty text-muted">{t('foundAs', { name: view.matched })}</p>
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
      </section>

      <section aria-labelledby={`${id}-history`} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${id}-history`} className="text-sm font-medium">
            {t('history')}
          </h3>
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== undefined || view.files === 0}
            onClick={onBackUp}
          >
            <HardDriveDownloadIcon aria-hidden="true" />
            {busy === 'back-up' ? t('backingUp') : t('backUp')}
          </Button>
        </div>
        <p className="text-sm text-pretty text-muted" aria-live="polite">
          {t(`state.${view.state}`)}
        </p>
        {view.snapshots.length === 0 ? (
          <p className="text-sm text-muted">{t('noneYet')}</p>
        ) : (
          <ol className="grid gap-2">
            {view.snapshots.map((snapshot) => (
              <SnapshotRow
                key={snapshot.id}
                title={title}
                snapshot={snapshot}
                computer={computerOf(snapshot.device)}
                busy={busy}
                onRestore={() => onRestore(snapshot)}
                onShow={() => onShow(snapshot)}
              />
            ))}
          </ol>
        )}
        <p className="text-xs text-pretty text-muted">
          {t.rich('caps', {
            kept: view.caps.kept,
            size: sizeOf(format, view.caps.mostMb * 1024 * 1024),
            link: (chunks) => (
              <Link href="/settings/saves" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </>
  )
}

/** When a snapshot was made, as a person says it: the day and the time. */
export const madeAt = (format: ReturnType<typeof useFormatter>, at: number) =>
  format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short' })

function SnapshotRow({
  title,
  snapshot,
  computer,
  busy,
  onRestore,
  onShow,
}: {
  title: string
  snapshot: Snapshot
  computer: string
  busy?: SavesBusy | undefined
  onRestore: () => void
  onShow: () => void
}) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const when = madeAt(format, snapshot.createdAt)
  return (
    <li className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm">
          {t.rich('at', {
            when,
            ago: format.relativeTime(snapshot.createdAt, now),
            time: (chunks) => (
              <time dateTime={new Date(snapshot.createdAt).toISOString()}>{chunks}</time>
            ),
            muted: (chunks) => <span className="text-muted">{chunks}</span>,
          })}
        </span>
        <span className="text-xs text-muted">
          {t('made', {
            files: snapshot.files,
            size: sizeOf(format, snapshot.bytes),
            computer,
          })}
        </span>
        {snapshot.here ? (
          <span className="flex items-center gap-1 text-xs font-medium">
            <CheckIcon aria-hidden="true" className="size-3.5 text-accent" />
            {t('hereNow')}
          </span>
        ) : null}
      </span>
      {snapshot.here ? null : (
        <Confirm
          title={t('restoreTitle', { when })}
          description={t('restoreBody', { title })}
          confirm={t('restore')}
          cancel={t('cancel')}
          onConfirm={onRestore}
        >
          <Button variant="secondary" size="sm" disabled={busy !== undefined}>
            {busy === `restore:${snapshot.id}` ? t('restoring') : t('restore')}
          </Button>
        </Confirm>
      )}
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
    </li>
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

/** The panel's insides, asking the app: read when it opens, and after everything done. */
function SavesBody({ game }: { game: SaveGame }) {
  const t = useTranslations('Saves')
  const format = useFormatter()
  const computerOf = useComputers()
  const [state, setState] = useState<SavesState>('loading')
  const [busy, setBusy] = useState<SavesBusy>()
  const [said, setSaid] = useState<SavesSaid>()
  const { entryId, title, apps } = game
  const key = apps.join(' ')

  useEffect(() => {
    let current = true
    saves
      .view({ entryId, title, apps: key === '' ? [] : key.split(' ') })
      .then((view) => current && setState(view))
      .catch(() => current && setState('failed'))
    return () => {
      current = false
    }
  }, [entryId, title, key])

  const run = async (
    doing: SavesBusy,
    work: () => Promise<SavesView | null>,
    done?: (view: SavesView) => string | undefined,
  ) => {
    setBusy(doing)
    setSaid(undefined)
    try {
      const view = await work()
      // Null: Windows' picker was closed, which changes nothing.
      if (view) {
        setState(view)
        const text = done?.(view)
        if (text) setSaid({ tone: 'done', text })
      }
    } catch (error) {
      setSaid({ tone: 'trouble', text: t(`refusal.${refusalKey(error)}`, { title }) })
    }
    setBusy(undefined)
  }

  return (
    <SavesPanelView
      title={title}
      state={state}
      computerOf={computerOf}
      busy={busy}
      said={said}
      onTurn={(on) => void run('turn', () => saves.turn(game, on))}
      onBackUp={() =>
        void run(
          'back-up',
          () => saves.backUp(game),
          (view) => (view.last?.did === 'unchanged' ? t('unchanged') : t('backedUp')),
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
    />
  )
}

type SavesPanelProps = SaveGame & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What it stands beside when it opens in place. */
  anchor: RefObject<HTMLElement | null>
}

function Frame({
  title,
  open,
  onOpenChange,
  anchor,
  children,
}: Omit<SavesPanelProps, 'entryId' | 'apps'> & { children: ReactNode }) {
  const t = useTranslations('Saves')
  return (
    <BesidePlay
      heading={t('title', { title })}
      closeLabel={t('close')}
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
    >
      {children}
    </BesidePlay>
  )
}

/**
 * A game's saves (ADR 008), opened from Play's menu, in the app alone. Read each time it opens, so what
 * another window or the tray changed is there.
 */
export default function SavesPanel({ entryId, title, apps, ...frame }: SavesPanelProps) {
  return (
    <AppWords>
      <Frame title={title} {...frame}>
        {frame.open ? <SavesBody game={{ entryId, title, apps }} /> : null}
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
