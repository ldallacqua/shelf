'use client'

import { ArchiveIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react'

import type { Answer, PlatformLabel } from '@/domain/library/adding'
import type { Changed, EditPatch, OwnedCopy, OwnerGame } from '@/domain/library/editing'
import { formats, statuses, type Format, type Status } from '@/domain/library/values'
import { useShelf } from '@/features/library/shelf'
import { libraryHref } from '@/features/library/shelf-address'
import { DayField, SavedRating, TagsField, today } from '@/features/owner/fields'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { ChoiceChip } from '@/ui/chip'
import { Input, Textarea } from '@/ui/field'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

import { editClient as actions } from './edit-client'

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
  const router = useRouter()
  const { handle } = useShelf()
  const id = useId()

  const [owned, setOwned] = useState(() => records.get(slug))
  const [saving, setSaving] = useState(0)
  // The page being drawn again after a change: busy until it has.
  const [drawing, startDrawing] = useTransition()
  const [problem, setProblem] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  // The platform I wanted it on, once it has left the wishlist: its first copy starts there.
  const [wasWanted, setWasWanted] = useState<number>()
  const shown = useRef<OwnerGame | undefined>(owned)

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
   * Shows `next` at once and saves it. On a refusal the field goes back and
   * the reason is said. On success the page fetches the library's new
   * version, and the record is read again for any new ids.
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
        return
      }
      // The new file, and nothing else: an edit moves neither the view behind the game nor
      // the game in front of it, as landing on a game just added would.
      announceChange({ version: result.value.version })
      // Over the shelf, the new library file is enough. A page of its own is
      // drawn on the server, so it is asked for again.
      if (refresh) startDrawing(() => router.refresh())
      const fresh = await actions.read(slug).catch(() => undefined)
      if (fresh?.ok && shown.current === next) {
        shown.current = fresh.value
        records.set(slug, fresh.value)
        setOwned(fresh.value)
      }
    } finally {
      setSaving((count) => count - 1)
    }
  }

  const update = (patch: EditPatch, next: Partial<OwnerGame>) =>
    save({ ...owned, ...next }, () => actions.update(owned.entryId, patch))

  const setStatus = (status: Status) => {
    // Completed sets the date to today, which stays editable.
    const completedOn = status === 'completed' && !owned.completedOn ? today() : undefined
    // Off the wishlist, what I wanted is let go (spec 7.5); the copy to add starts on it.
    const leaving = owned.status === 'wishlist' && status !== 'wishlist'
    if (leaving && owned.wanted[0] !== undefined) setWasWanted(owned.wanted[0])
    void update(
      { status, ...(completedOn ? { completedOn } : {}) },
      { status, ...(completedOn ? { completedOn } : {}), ...(leaving ? { wanted: [] } : {}) },
    )
  }

  const labels = new Map(owned.platforms.map((platform) => [platform.id, platform]))

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
      <div className="flex items-baseline justify-between gap-3">
        <Level className="readout text-[0.6875rem] text-muted">{game('mine')}</Level>
        <p className="text-xs text-muted" aria-live="polite">
          {saving > 0 ? t('saving') : ''}
        </p>
      </div>
      {problem ? (
        <p
          role="alert"
          className="mt-2 rounded-control border border-line-strong px-3 py-2 text-sm"
        >
          {problem}
        </p>
      ) : null}

      <div className="mt-3 grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">{game('status')}</legend>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <SavedField
            label={t('played')}
            value={owned.minutes > 0 ? String(Math.round((owned.minutes / 60) * 10) / 10) : ''}
            inputMode="decimal"
            onSave={(text) => {
              const hours = Number(text.trim().replace(',', '.') || '0')
              if (!Number.isFinite(hours) || hours < 0) {
                setProblem(t('playedRange'))
                return
              }
              const minutes = Math.round(hours * 60)
              void update({ minutes }, { minutes })
            }}
          />
          {owned.status === 'completed' || owned.completedOn ? (
            <DayField
              label={t('completedOn')}
              value={owned.completedOn}
              clearable
              onChange={(day) =>
                void update({ completedOn: day ?? null }, { completedOn: day ?? undefined })
              }
            />
          ) : null}
        </div>

        {owned.status === 'wishlist' && owned.platforms.length > 0 ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t('wanted')}</legend>
            <div className="flex flex-wrap gap-2">
              {owned.platforms.map((platform) => (
                <ChoiceChip
                  key={platform.id}
                  type="checkbox"
                  checked={owned.wanted.includes(platform.id)}
                  onChange={(event) => {
                    const wanted = event.target.checked
                      ? [...owned.wanted, platform.id]
                      : owned.wanted.filter((each) => each !== platform.id)
                    void update({ wanted }, { wanted })
                  }}
                >
                  {platform.name}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ) : null}

        {/* On the wishlist, what I want takes the place of what I own, unless a copy is there already. */}
        {owned.status !== 'wishlist' || owned.copies.length > 0 ? (
          <Copies
            owned={owned}
            labels={labels}
            platforms={owned.platforms}
            preset={wasWanted}
            onFormat={(copy, format) =>
              save(
                {
                  ...owned,
                  copies: owned.copies.map((each) =>
                    each.id === copy.id ? { ...each, format } : each,
                  ),
                },
                () => actions.setFormat(owned.entryId, copy.id, format),
              )
            }
            onRemove={(copy) =>
              save({ ...owned, copies: owned.copies.filter((each) => each.id !== copy.id) }, () =>
                actions.removeCopy(owned.entryId, copy.id),
              )
            }
            onAdd={(platformId, format) =>
              save(
                {
                  ...owned,
                  copies: [
                    ...owned.copies,
                    { id: `new-${platformId}-${format}`, platformId, format },
                  ],
                },
                () => actions.addCopy(owned.entryId, { platformId, format }),
              )
            }
          />
        ) : null}

        <TagsField value={owned.tags} onChange={(tags) => void update({ tags }, { tags })} />

        <div className="grid gap-2">
          <SavedField
            label={game('notes')}
            value={owned.notes ?? ''}
            multiline
            onSave={(text) => {
              const notes = text.trim()
              void update({ notes: notes || null }, { notes: notes || undefined })
            }}
          />
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
            <Switch
              checked={owned.notesPublic}
              onChange={(event) =>
                update({ notesPublic: event.target.checked }, { notesPublic: event.target.checked })
              }
            />
            {t('notesPublic')}
          </label>
        </div>

        {/* Only I see it (spec 11.1); on a private shelf every game already is, and this waits for it to go public. */}
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
          <Switch
            checked={owned.private}
            onChange={(event) =>
              update({ private: event.target.checked }, { private: event.target.checked })
            }
          />
          {t('private')}
        </label>

        {owned.versions.length > 1 ? (
          <div className="grid gap-2">
            <Minor className="readout text-[0.625rem] text-muted">{t('versions')}</Minor>
            <ul className="grid gap-2">
              {owned.versions.map((version) => (
                <li
                  key={version.gameId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                  <span className="font-semibold">{version.title}</span>
                  {version.year ? (
                    <span className="readout text-[0.6875rem] text-muted">{version.year}</span>
                  ) : null}
                  <span className="text-muted">
                    {[
                      t(`relations.${version.relation}`),
                      ...version.platforms.flatMap((platform) => labels.get(platform)?.short ?? []),
                    ].join(' · ')}
                  </span>
                  {version.relation === 'primary' ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        save(owned, () =>
                          actions.update(owned.entryId, { mainVersion: version.gameId }),
                        )
                      }
                    >
                      {t('makeMain')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
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

/** A text field saved when it is left or Enter is pressed, if it changed. */
function SavedField({
  label,
  value,
  onSave,
  inputMode,
  multiline,
}: {
  label: string
  value: string
  onSave: (text: string) => void
  inputMode?: 'decimal'
  multiline?: boolean
}) {
  const [text, setText] = useState(value)
  const [from, setFrom] = useState(value)
  // A saved or reverted value replaces what is in the field, unless it is being typed in.
  if (value !== from) {
    setFrom(value)
    setText(value)
  }
  const commit = () => {
    if (text !== value) onSave(text)
  }
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {multiline ? (
        <Textarea
          grow
          value={text}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          className="font-normal"
        />
      ) : (
        <Input
          value={text}
          inputMode={inputMode}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          className="font-normal"
        />
      )}
    </label>
  )
}

/** Platforms owned: switch a copy's format, remove it, or add another. */
function Copies({
  owned,
  labels,
  platforms,
  preset,
  onFormat,
  onRemove,
  onAdd,
}: {
  owned: OwnerGame
  labels: ReadonlyMap<number, PlatformLabel>
  platforms: readonly PlatformLabel[]
  /** The platform to start on: the one I wanted it on, once it has left the wishlist. */
  preset?: number
  onFormat: (copy: OwnedCopy, format: Format) => void
  onRemove: (copy: OwnedCopy) => void
  onAdd: (platformId: number, format: Format) => void
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
  const [platform, setPlatform] = useState<number>()
  const [format, setFormat] = useState<Format>('physical')
  const chosen =
    platform ?? (open.some((each) => each.id === preset) ? preset : undefined) ?? open[0]?.id

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">{game('owned')}</legend>
      {owned.copies.length === 0 ? (
        <p className="text-sm text-muted">{library('shelf.notOwned')}</p>
      ) : (
        <ul className="grid gap-2">
          {owned.copies.map((copy) => {
            const name = labels.get(copy.platformId)?.name ?? ''
            return (
              <li key={copy.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="min-w-28 flex-1 font-medium">
                  {name}
                  {copy.synced?.map((each) => (
                    <span key={each.source} className="ml-2 font-normal text-muted">
                      {t('syncedHours', {
                        source: sync(`source.${each.source}`),
                        hours: Math.round(each.minutes / 6) / 10,
                      })}
                    </span>
                  ))}
                </span>
                <Segmented
                  aria-label={t('formatOf', { platform: name })}
                  value={copy.format}
                  onValueChange={(format: Format) => onFormat(copy, format)}
                >
                  {formats.map((each) => (
                    <SegmentedItem key={each} value={each}>
                      {library(`format.${each}`)}
                    </SegmentedItem>
                  ))}
                </Segmented>
                <button
                  type="button"
                  aria-label={t('removeCopy', {
                    platform: name,
                    format: library(`format.${copy.format}`),
                  })}
                  onClick={() => onRemove(copy)}
                  className="inline-flex size-10 items-center justify-center rounded-control text-muted hover:bg-text/8 hover:text-text pointer-coarse:size-11"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open.length > 0 && chosen !== undefined ? (
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <div className="grid min-w-44 flex-1 gap-1.5">
            <label htmlFor={`${id}-platform`} className="text-sm font-medium">
              {t('copyPlatform')}
            </label>
            <Select value={String(chosen)} onValueChange={(value) => setPlatform(Number(value))}>
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
          <div className="grid min-w-32 gap-1.5">
            <label htmlFor={`${id}-format`} className="text-sm font-medium">
              {t('copyFormat')}
            </label>
            <Select value={format} onValueChange={(value) => setFormat(value as Format)}>
              <SelectTrigger id={`${id}-format`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((each) => (
                  <SelectItem key={each} value={each} disabled={have.has(`${chosen}:${each}`)}>
                    {library(`format.${each}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={have.has(`${chosen}:${format}`)}
            onClick={() => onAdd(chosen, format)}
          >
            {t('addCopy')}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}
