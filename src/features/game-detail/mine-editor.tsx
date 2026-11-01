'use client'

import { ArchiveIcon, PlusIcon, SplitIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react'

import type { Answer, PlatformLabel } from '@/domain/library/adding'
import type {
  Changed,
  EditPatch,
  OwnedCopy,
  OwnedVersion,
  OwnerGame,
} from '@/domain/library/editing'
import { AWAY_AFTER_MINUTES, isPcSource, playedMinutes } from '@/domain/library/hours'
import { isPcPlatform, takesStore, type StoreName } from '@/domain/library/stores'
import {
  formats,
  statuses,
  type Format,
  type Status,
  type SyncSource,
} from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { useShelf } from '@/features/library/shelf'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { DayField, SavedRating, StoresField, TagsField, today } from '@/features/owner/fields'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { ChoiceChip } from '@/ui/chip'
import { cn } from '@/ui/cn'
import { Textarea } from '@/ui/field'
import { NumberField } from '@/ui/number-field'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Tip } from '@/ui/tooltip'

import { editClient as actions } from './edit-client'
import {
  mineCard,
  mineGroup,
  mineGroupRuled,
  mineGroups,
  mineHeading,
  mineNewCard,
  mineTop,
} from './mine-layout'
import { Play } from './play'

/**
 * The records read so far this visit, by game: a game opened again is
 * edited at once, and read again behind it in case it changed.
 */
const records = new Map<string, OwnerGame>()

type MineEditorProps = {
  slug: string
  level: 'h2' | 'h3'
  minor: 'h3' | 'h4'
  onRemoved?: () => void
  /** On a page of its own: draw the page again after each change. */
  refresh?: boolean
  /** Shown until the game's editable record has arrived. */
  fallback: ReactNode
}

/**
 * Every field under "Mine", edited in place and saved as it changes (spec
 * 7.3). A change shows at once; if saving fails it goes back and says why.
 * Status takes effect on the shelf as soon as the new library file is in.
 */
export function MineEditor({
  slug,
  level: Level,
  minor: Minor,
  onRemoved,
  refresh,
  fallback,
}: MineEditorProps) {
  const t = useTranslations('Edit')
  const game = useTranslations('Game')
  const library = useTranslations('Library')
  const errors = useTranslations('Add')
  const sync = useTranslations('Sync')
  const router = useRouter()
  const locale = useLocale()
  const { handle } = useShelf()
  const id = useId()

  const [owned, setOwned] = useState(() => records.get(slug))
  const [saving, setSaving] = useState(0)
  // The page being drawn again after a change: busy until it has.
  const [drawing, startDrawing] = useTransition()
  const [problem, setProblem] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  // The version asked about before it is made a game of its own (spec 7.6).
  const [separating, setSeparating] = useState<string>()
  // The platform I wanted it on, once it has left the wishlist: its first copy starts there.
  const [wasWanted, setWasWanted] = useState<number>()
  const [wasWantedStores, setWasWantedStores] = useState<StoreName[]>()
  // Asked for, the field for time left idle shows before it holds any.
  const [idling, setIdling] = useState(false)
  const idleField = useRef<HTMLDivElement>(null)
  const shown = useRef<OwnerGame | undefined>(owned)

  // Asked for from the line above it, the field takes the focus the button had.
  useEffect(() => {
    if (idling) idleField.current?.querySelector('input')?.focus()
  }, [idling])

  useEffect(() => {
    let current = true
    void actions
      .read(slug)
      .catch(() => undefined)
      .then((result) => {
        if (!current) return
        if (!result) return
        if (!result.ok) {
          setProblem(errors(`errors.${result.reason}`))
          return
        }
        // Not over a change made since: its own save reads the record again.
        if (shown.current !== records.get(slug)) return
        shown.current = result.value
        records.set(slug, result.value)
        setOwned(result.value)
      })
    return () => {
      current = false
    }
  }, [slug, errors])

  if (!owned) return fallback

  /**
   * After a change: the page fetches the library's new version, and the
   * record is read again for any new ids.
   */
  const changed = async (version: number, next: OwnerGame) => {
    // The new file, and nothing else: an edit moves neither the view behind the game nor
    // the game in front of it, as landing on a game just added would.
    announceChange({ version })
    // Over the shelf, the new library file is enough. A page of its own is
    // drawn on the server, so it is asked for again.
    if (refresh) startDrawing(() => router.refresh())
    const fresh = await actions.read(slug).catch(() => undefined)
    if (fresh?.ok && shown.current === next) {
      shown.current = fresh.value
      records.set(slug, fresh.value)
      setOwned(fresh.value)
    }
  }

  /**
   * Shows `next` at once and saves it. On a refusal the field goes back and
   * the reason is said. Says whether it was saved.
   */
  const save = async (next: OwnerGame, write: () => Promise<Answer<Changed>>) => {
    const before = shown.current
    shown.current = next
    setOwned(next)
    setProblem(undefined)
    setSaving((count) => count + 1)
    try {
      // A request cut short (the page left, the network went) is a failure like any other.
      const result = await write().catch((): Answer<Changed> => ({ ok: false, reason: 'failed' }))
      if (!result.ok) {
        shown.current = before
        if (before) setOwned(before)
        setProblem(errors(`errors.${result.reason}`))
        return false
      }
      await changed(result.value.version, next)
      return true
    } finally {
      setSaving((count) => count - 1)
    }
  }

  /**
   * Off the wishlist, I may have just bought it: Steam is asked about this game now, so its copy,
   * hours and achievements don't wait for a sync. Nothing here is mine to see fail: what I chose
   * is saved, and a sync still finds it.
   */
  const askSteam = async (entryId: string) => {
    setSaving((count) => count + 1)
    try {
      const result = await actions.sync(entryId).catch(() => undefined)
      if (result?.ok && shown.current) await changed(result.value.version, shown.current)
    } finally {
      setSaving((count) => count - 1)
    }
  }

  const update = (patch: EditPatch, next: Partial<OwnerGame>) =>
    save({ ...owned, ...next }, () => actions.update(owned.entryId, patch))

  const setStatus = (status: Status) => {
    // Completed takes the day it was last played on a platform, or else today (spec 7.3);
    // either stays editable.
    const completedOn =
      status === 'completed' && !owned.completedOn ? (owned.lastPlayedOn ?? today()) : undefined
    // Off the wishlist, what I wanted is let go (spec 7.5); the copy to add starts on it.
    const leaving = owned.status === 'wishlist' && status !== 'wishlist'
    if (leaving && owned.wanted[0] !== undefined) {
      // A PC first, if a store on it is what I wanted: the copy starts there, from that store.
      const stores = owned.wantedStores ?? []
      const onPc = stores.length > 0 ? owned.wanted.find(isPcPlatform) : undefined
      setWasWanted(onPc ?? owned.wanted[0])
      if (onPc !== undefined) setWasWantedStores(stores)
    }
    void update(
      { status, ...(completedOn ? { completedOn } : {}) },
      {
        status,
        ...(completedOn ? { completedOn } : {}),
        ...(leaving ? { wanted: [], wantedStores: [] } : {}),
      },
    ).then((saved) => {
      if (saved && leaving) void askSteam(owned.entryId)
    })
  }

  const labels = new Map(owned.platforms.map((platform) => [platform.id, platform]))
  const hoursText = (hours: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(hours)
  // What the stores report on its copies, source by source.
  const reports = new Map<SyncSource, number>()
  for (const { source, minutes } of owned.copies.flatMap((copy) => copy.synced ?? [])) {
    reports.set(source, (reports.get(source) ?? 0) + minutes)
  }
  const synced = [...reports.values()].reduce((sum, minutes) => sum + minutes, 0)
  const time = { tracked: owned.tracked, pc: 0, console: 0 }
  for (const [source, minutes] of reports) {
    if (isPcSource(source)) time.pc += minutes
    else time.console += minutes
  }
  // Of that, what I said sat idle: it comes off the stores' hours, never off what the app counted.
  const idle = owned.idle ?? 0
  const played = playedMinutes(time, idle)
  const tenths = (minutes: number) => Math.round(minutes / 6) / 10

  /** Out of sight, kept whole (spec 7.4): nothing is lost, so nothing is asked first. */
  const archive = async () => {
    setConfirming(false)
    setSaving((count) => count + 1)
    const result = await actions
      .archive(owned.entryId)
      .catch(() => ({ ok: false as const, reason: 'failed' as const }))
    setSaving((count) => count - 1)
    if (!result.ok) {
      setProblem(errors(`errors.${result.reason}`))
      return
    }
    records.delete(slug)
    const { entryId, title } = result.value
    notify({
      message: t('archived', { title }),
      actions: [
        {
          label: errors('undo'),
          run: async () => {
            const back = await actions.bringBack(entryId)
            if (!back.ok) {
              notify({ message: errors(`errors.${back.reason}`) })
              return
            }
            announceChange({ version: back.value.version, slug: back.value.slug, title })
            notify({ message: t('broughtBack', { title }) })
            router.refresh()
          },
        },
      ],
    })
    announceChange({ version: result.value.version })
    if (onRemoved) onRemoved()
    else router.push(libraryHref(handle))
  }

  /** A version made a game of its own (spec 7.6): gone from here at once, and Open goes to it. */
  const separate = (version: OwnedVersion) => {
    setSeparating(undefined)
    void save(
      { ...owned, versions: owned.versions.filter((each) => each.gameId !== version.gameId) },
      async () => {
        const result = await actions.separate(owned.entryId, version.gameId)
        if (result.ok) {
          const { slug: other, title } = result.value
          notify({
            message: t('separated', { title }),
            actions: [{ label: t('open'), run: () => router.push(gameHref(handle, other)) }],
          })
        }
        return result
      },
    )
  }

  const remove = async () => {
    setConfirming(false)
    setSaving((count) => count + 1)
    const result = await actions.remove(owned.entryId)
    setSaving((count) => count - 1)
    if (!result.ok) {
      setProblem(errors(`errors.${result.reason}`))
      return
    }
    // Put back, it is a new entry: read afresh.
    records.delete(slug)
    const { undo, title } = result.value
    notify({
      message: t('removed', { title }),
      actions: [
        {
          label: errors('undo'),
          run: async () => {
            const back = await actions.restore(undo)
            if (!back.ok) {
              notify({ message: errors(`errors.${back.reason}`) })
              return
            }
            announceChange({ version: back.value.version, slug: back.value.slug, title })
            notify({ message: t('restored', { title }) })
            router.refresh()
          },
        },
      ],
    })
    announceChange({ version: result.value.version })
    if (onRemoved) onRemoved()
    else router.push(libraryHref(handle))
  }

  return (
    <section className="game-section" aria-busy={saving > 0 || drawing}>
      <div className={mineTop}>
        <Level className="readout text-[0.6875rem] text-muted">{game('mine')}</Level>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted" aria-live="polite">
            {saving > 0 ? t('saving') : ''}
          </p>
          <Play entryId={owned.entryId} title={owned.title} steam={owned.steam} />
        </div>
      </div>
      {problem ? (
        <p
          role="alert"
          className="mt-2 rounded-control border border-line-strong px-3 py-2 text-sm"
        >
          {problem}
        </p>
      ) : null}

      <div className={mineGroups}>
        <div className={mineGroup}>
          <fieldset className="grid gap-2">
            <legend className={cn(mineHeading, 'mb-2')}>{game('status')}</legend>
            <div className="flex flex-wrap gap-2">
              {statuses.map((each) => (
                <ChoiceChip
                  key={each}
                  type="radio"
                  name={`${id}-status`}
                  checked={owned.status === each}
                  onChange={() => setStatus(each)}
                >
                  {library(`status.${each}`)}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>

          <SavedRating
            score={owned.rating}
            onSave={(score) =>
              void update({ rating: score }, { rating: score === null ? undefined : score })
            }
          />

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('played')}</span>
            <p className="flex h-10 items-center text-xl font-semibold tabular-nums pointer-coarse:h-11">
              {played > 0 ? t('playedHours', { hours: tenths(played) }) : t('playedNone')}
            </p>
            {owned.tracked > 0 || synced > 0 ? (
              <ul className="grid gap-0.5 text-xs text-muted">
                {owned.tracked > 0 ? (
                  <li>{t('playedTracked', { hours: tenths(owned.tracked) })}</li>
                ) : null}
                {[...reports].map(([source, minutes]) => (
                  <li key={source}>
                    {t('syncedHours', {
                      source: sync(`source.${source}`),
                      hours: tenths(minutes),
                    })}
                  </li>
                ))}
                {idle > 0 ? <li>{t('playedIdle', { hours: tenths(idle) })}</li> : null}
                {owned.tracked > 0 && time.pc > 0 ? <li>{t('playedSamePlay')}</li> : null}
              </ul>
            ) : null}
            {synced > 0 && idle === 0 && !idling ? (
              <button
                type="button"
                onClick={() => setIdling(true)}
                className="w-fit rounded-[2px] text-xs text-text underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {t('idleStart')}
              </button>
            ) : null}
            <details className="text-xs text-muted">
              <summary className="w-fit cursor-pointer rounded-[2px] underline decoration-1 underline-offset-4 hover:decoration-2">
                {t('playedHow')}
              </summary>
              <p className="mt-1.5">{t('playedHowBody', { minutes: AWAY_AFTER_MINUTES })}</p>
            </details>
          </div>

          {synced > 0 && (idle > 0 || idling) ? (
            <div ref={idleField}>
              <NumberField
                label={t('idle')}
                value={idle > 0 ? idle / 60 : undefined}
                decimals={1}
                max={synced / 60}
                unit="h"
                format={hoursText}
                decreaseLabel={t('hourFewer')}
                increaseLabel={t('hourMore')}
                hint={t('idleHint')}
                onCommit={(hours) => {
                  const minutes = Math.round((hours ?? 0) * 60)
                  void update({ idle: minutes }, { idle: minutes })
                }}
              />
            </div>
          ) : null}

          {owned.status === 'completed' || owned.completedOn ? (
            <DayField
              label={t('completedOn')}
              value={owned.completedOn}
              clearable
              hint={
                owned.lastPlayedOn && owned.status === 'completed'
                  ? t('lastPlayed', {
                      date: new Intl.DateTimeFormat(locale, {
                        timeZone: 'UTC',
                        dateStyle: 'medium',
                      }).format(new Date(`${owned.lastPlayedOn}T00:00:00Z`)),
                    })
                  : undefined
              }
              onChange={(day) => {
                // Taken away, a completed game's day is its last play's again: the server does
                // the same.
                const shown = day ?? (owned.status === 'completed' ? owned.lastPlayedOn : undefined)
                void update({ completedOn: day ?? null }, { completedOn: shown })
              }}
            />
          ) : null}
        </div>

        {owned.status === 'wishlist' && owned.platforms.length > 0 ? (
          <fieldset className={mineGroupRuled}>
            <legend className={cn(mineHeading, 'float-left mb-2')}>{t('wanted')}</legend>
            <div className="clear-left flex flex-wrap gap-2">
              {owned.platforms.map((platform) => (
                <ChoiceChip
                  key={platform.id}
                  type="checkbox"
                  checked={owned.wanted.includes(platform.id)}
                  onChange={(event) => {
                    const wanted = event.target.checked
                      ? [...owned.wanted, platform.id]
                      : owned.wanted.filter((each) => each !== platform.id)
                    // Off a PC, its stores go with it: the server does the same.
                    const stores = wanted.some(isPcPlatform) ? {} : { wantedStores: [] }
                    void update({ wanted }, { wanted, ...stores })
                  }}
                >
                  {platform.name}
                </ChoiceChip>
              ))}
            </div>
            {owned.wanted.some(isPcPlatform) ? (
              <StoresField
                soldOn={owned.soldOn}
                value={owned.wantedStores ?? []}
                onChange={(wantedStores) => void update({ wantedStores }, { wantedStores })}
              />
            ) : null}
          </fieldset>
        ) : null}

        {/* On the wishlist, what I want takes the place of what I own, unless a copy is there already. */}
        {owned.status !== 'wishlist' || owned.copies.length > 0 ? (
          <Copies
            owned={owned}
            labels={labels}
            platforms={owned.platforms}
            preset={wasWanted}
            presetStores={wasWantedStores}
            onFormat={(copy, format) =>
              save(
                {
                  ...owned,
                  copies: owned.copies.map((each) =>
                    each.id === copy.id
                      ? { ...each, format, ...(format === 'digital' ? {} : { stores: [] }) }
                      : each,
                  ),
                },
                () => actions.setFormat(owned.entryId, copy.id, format),
              )
            }
            onStores={(copy, stores) =>
              save(
                {
                  ...owned,
                  copies: owned.copies.map((each) =>
                    each.id === copy.id ? { ...each, stores } : each,
                  ),
                },
                () => actions.setStores(owned.entryId, copy.id, stores),
              )
            }
            onRemove={(copy) =>
              save({ ...owned, copies: owned.copies.filter((each) => each.id !== copy.id) }, () =>
                actions.removeCopy(owned.entryId, copy.id),
              )
            }
            onAdd={(platformId, format, stores) =>
              save(
                {
                  ...owned,
                  copies: [
                    ...owned.copies,
                    { id: `new-${platformId}-${format}`, platformId, format, stores },
                  ],
                },
                () =>
                  actions.addCopy(owned.entryId, {
                    platformId,
                    format,
                    ...(stores.length > 0 ? { stores } : {}),
                  }),
              )
            }
          />
        ) : null}

        <div className={mineGroupRuled}>
          <TagsField value={owned.tags} onChange={(tags) => void update({ tags }, { tags })} />
          <div className="grid gap-2">
            <SavedField
              label={game('notes')}
              value={owned.notes ?? ''}
              onSave={(text) => {
                const notes = text.trim()
                void update({ notes: notes || null }, { notes: notes || undefined })
              }}
            />
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
              <Switch
                checked={owned.notesPublic}
                onChange={(event) =>
                  update(
                    { notesPublic: event.target.checked },
                    { notesPublic: event.target.checked },
                  )
                }
              />
              {t('notesPublic')}
            </label>
          </div>
        </div>

        {/* Only I see it (spec 11.1); on a private shelf every game already is, and this waits for it to go public. */}
        <div className={mineGroupRuled}>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Switch
              className="mt-0.5"
              checked={owned.private}
              onChange={(event) =>
                update({ private: event.target.checked }, { private: event.target.checked })
              }
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{t('privateTitle')}</span>
              <span className="text-pretty text-muted">{t('privateHint')}</span>
            </span>
          </label>
        </div>

        {owned.versions.length > 1 ? (
          <div className={mineGroupRuled}>
            <Minor className={mineHeading}>{t('versions')}</Minor>
            <ul className="grid gap-2">
              {owned.versions.map((version) => {
                const main = version.relation === 'primary'
                const on = version.platforms.flatMap(
                  (platform) => labels.get(platform)?.short ?? [],
                )
                return (
                  <li key={version.gameId} className={mineCard}>
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="relative block w-12 flex-none overflow-hidden rounded-[3px] bg-text/8"
                        style={{ aspectRatio: '3 / 4' }}
                      >
                        <Cover
                          cover={version.cover}
                          colors={version.colors}
                          hash={version.hash}
                          title={version.title}
                          sizes="48px"
                        />
                      </span>
                      <div className="grid min-w-0 flex-1 content-start gap-1.5">
                        <p className="text-sm font-semibold text-pretty">{version.title}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 font-medium',
                              main ? 'border-accent text-accent' : 'border-line-strong',
                            )}
                          >
                            {t(`relations.${version.relation}`)}
                          </span>
                          {version.year ? (
                            <span className="readout text-[0.6875rem]">{version.year}</span>
                          ) : null}
                        </p>
                        {on.length > 0 ? (
                          <p className="text-xs text-pretty text-muted">{on.join(' · ')}</p>
                        ) : null}
                      </div>
                    </div>
                    {main ? null : separating === version.gameId ? (
                      <div
                        role="group"
                        aria-label={t('separate')}
                        className="grid gap-3 border-t border-line pt-3"
                      >
                        <p className="text-sm text-pretty">
                          {t('confirmSeparate', { title: version.title, main: owned.title })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="primary" size="sm" onClick={() => separate(version)}>
                            <SplitIcon aria-hidden="true" />
                            {t('separateConfirm')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSeparating(undefined)}
                          >
                            {t('keepTogether')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            save(owned, () =>
                              actions.update(owned.entryId, { mainVersion: version.gameId }),
                            )
                          }
                        >
                          <StarIcon aria-hidden="true" />
                          {t('makeMain')}
                        </Button>
                        <Button
                          size="sm"
                          aria-expanded={false}
                          onClick={() => setSeparating(version.gameId)}
                        >
                          <SplitIcon aria-hidden="true" />
                          {t('separate')}
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          {confirming ? (
            <div role="group" aria-label={t('remove')} className="grid gap-3">
              <p className="text-sm text-pretty">{t('confirmRemove', { title: owned.title })}</p>
              <p className="text-sm text-pretty text-muted">{t('orArchive')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={remove}>
                  {t('confirm')}
                </Button>
                <Button variant="secondary" onClick={() => void archive()}>
                  <ArchiveIcon aria-hidden="true" />
                  {t('archive')}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {t('keep')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => void archive()}>
                <ArchiveIcon aria-hidden="true" />
                {t('archive')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                <Trash2Icon aria-hidden="true" />
                {t('remove')}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** Several lines of text, saved when they are left, if they changed. */
function SavedField({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(value)
  const [from, setFrom] = useState(value)
  // A saved or reverted value replaces what is in the field, unless it is being typed in.
  if (value !== from) {
    setFrom(value)
    setText(value)
  }
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Textarea
        grow
        value={text}
        rows={4}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onSave(text)
        }}
        className="font-normal"
      />
    </label>
  )
}

/**
 * Platforms owned: a card for each copy, its format switched or the copy
 * removed there, and apart from them, behind a button of its own, a new copy
 * put together.
 */
function Copies({
  owned,
  labels,
  platforms,
  preset,
  presetStores,
  onFormat,
  onStores,
  onRemove,
  onAdd,
}: {
  owned: OwnerGame
  labels: ReadonlyMap<number, PlatformLabel>
  platforms: readonly PlatformLabel[]
  /** The platform to start on: the one I wanted it on, once it has left the wishlist. */
  preset?: number
  /** And the stores I would have bought it from. */
  presetStores?: readonly StoreName[]
  onFormat: (copy: OwnedCopy, format: Format) => void
  onStores: (copy: OwnedCopy, stores: StoreName[]) => void
  onRemove: (copy: OwnedCopy) => void
  onAdd: (platformId: number, format: Format, stores: StoreName[]) => void
}) {
  const t = useTranslations('Edit')
  const game = useTranslations('Game')
  const library = useTranslations('Library')
  const sync = useTranslations('Sync')
  const id = useId()
  const have = new Set(owned.copies.map((copy) => `${copy.platformId}:${copy.format}`))
  const open = platforms.filter((platform) =>
    formats.some((format) => !have.has(`${platform.id}:${format}`)),
  )
  // Left the wishlist for a platform I wanted: the new copy is already begun.
  const [adding, setAdding] = useState(preset !== undefined)
  const [platform, setPlatform] = useState<number>()
  const chosen =
    platform ?? (open.some((each) => each.id === preset) ? preset : undefined) ?? open[0]?.id
  const free = formats.filter((each) => !have.has(`${chosen}:${each}`))
  // Nearly every PC game is a download, and only a download has a store to ask about.
  const [picked, setPicked] = useState<Format>()
  const usual = picked ?? (chosen !== undefined && isPcPlatform(chosen) ? 'digital' : 'physical')
  const format = free.includes(usual) ? usual : (free[0] ?? usual)
  const [stores, setStores] = useState<StoreName[]>(() => [...(presetStores ?? [])])

  return (
    <fieldset className={mineGroupRuled}>
      <legend className={cn(mineHeading, 'float-left')}>{game('owned')}</legend>
      <div className="clear-left grid gap-2">
        {owned.copies.length === 0 ? (
          <p className="text-sm text-muted">{t('noCopies')}</p>
        ) : (
          <ul className="grid gap-2">
            {owned.copies.map((copy) => {
              const name = labels.get(copy.platformId)?.name ?? ''
              const removeLabel = t('removeCopy', {
                platform: name,
                format: library(`format.${copy.format}`),
              })
              return (
                <li key={copy.id} className={mineCard}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-0.5 pt-1">
                      <span className="text-sm font-semibold">{name}</span>
                      {copy.synced?.map((each) => (
                        <span key={each.source} className="text-xs text-muted">
                          {t('syncedHours', {
                            source: sync(`source.${each.source}`),
                            hours: Math.round(each.minutes / 6) / 10,
                          })}
                        </span>
                      ))}
                    </div>
                    <Tip label={removeLabel}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={removeLabel}
                        onClick={() => onRemove(copy)}
                        className="-mt-1 -mr-1 text-muted hover:text-text"
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </Tip>
                  </div>
                  <Segmented
                    aria-label={t('formatOf', { platform: name })}
                    value={copy.format}
                    onValueChange={(next: Format) => onFormat(copy, next)}
                    className="grid w-full grid-cols-2"
                  >
                    {formats.map((each) => (
                      <SegmentedItem key={each} value={each}>
                        {library(`format.${each}`)}
                      </SegmentedItem>
                    ))}
                  </Segmented>
                  {takesStore(copy.platformId, copy.format) ? (
                    <StoresField
                      soldOn={owned.soldOn}
                      value={copy.stores ?? []}
                      onChange={(next) => onStores(copy, next)}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {open.length > 0 && chosen !== undefined ? (
          adding ? (
            <div role="group" aria-label={t('newCopy')} className={mineNewCard}>
              <p className={mineHeading}>{t('newCopy')}</p>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-platform`} className="text-sm font-medium">
                  {t('copyPlatform')}
                </label>
                <Select
                  value={String(chosen)}
                  onValueChange={(value) => setPlatform(Number(value))}
                >
                  <SelectTrigger id={`${id}-platform`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {open.map((each) => (
                      <SelectItem key={each.id} value={String(each.id)}>
                        {each.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <span aria-hidden="true" className="text-sm font-medium">
                  {t('copyFormat')}
                </span>
                <Segmented
                  aria-label={t('copyFormat')}
                  value={format}
                  onValueChange={(next: Format) => setPicked(next)}
                  className="grid w-full grid-cols-2"
                >
                  {formats.map((each) => (
                    <SegmentedItem key={each} value={each} disabled={!free.includes(each)}>
                      {library(`format.${each}`)}
                    </SegmentedItem>
                  ))}
                </Segmented>
              </div>
              {takesStore(chosen, format) ? (
                <StoresField soldOn={owned.soldOn} value={stores} onChange={setStores} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!free.includes(format)}
                  onClick={() => {
                    onAdd(chosen, format, takesStore(chosen, format) ? stores : [])
                    setAdding(false)
                    setPlatform(undefined)
                    setStores([])
                  }}
                >
                  <PlusIcon aria-hidden="true" />
                  {t('addThisCopy')}
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full border-dashed text-muted hover:text-text"
              onClick={() => setAdding(true)}
            >
              <PlusIcon aria-hidden="true" />
              {t('addCopy')}
            </Button>
          )
        ) : null}
      </div>
    </fieldset>
  )
}
