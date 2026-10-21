'use client'

import { Trash2Icon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react'

import type { Answer, PlatformLabel } from '@/domain/library/adding'
import type { Changed, EditPatch, OwnedCopy, OwnerGame } from '@/domain/library/editing'
import { formats, statuses, type Format, type Status } from '@/domain/library/values'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'

import { editClient as actions } from './edit-client'

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

const today = () => new Date().toISOString().slice(0, 10)

const FIELD =
  'h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-sm text-text pointer-coarse:h-11'

const CHIP =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent pointer-coarse:min-h-11'

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
  const id = useId()

  const [owned, setOwned] = useState<OwnerGame>()
  const [saving, setSaving] = useState(0)
  // The page being drawn again after a change: busy until it has.
  const [drawing, startDrawing] = useTransition()
  const [problem, setProblem] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const shown = useRef<OwnerGame | undefined>(undefined)

  useEffect(() => {
    let current = true
    void actions
      .read(slug)
      .catch(() => undefined)
      .then((result) => {
        if (!current) return
        if (!result) return
        if (result.ok) {
          shown.current = result.value
          setOwned(result.value)
        } else setProblem(errors(`errors.${result.reason}`))
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
      announceChange({ version: result.value.version, slug })
      // Over the shelf, the new library file is enough. A page of its own is
      // drawn on the server, so it is asked for again.
      if (refresh) startDrawing(() => router.refresh())
      const fresh = await actions.read(slug).catch(() => undefined)
      if (fresh?.ok && shown.current === next) {
        shown.current = fresh.value
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
    void update(
      { status, ...(completedOn ? { completedOn } : {}) },
      { status, ...(completedOn ? { completedOn } : {}) },
    )
  }

  const labels = new Map(owned.platforms.map((platform) => [platform.id, platform]))

  const remove = async () => {
    setConfirming(false)
    setSaving((count) => count + 1)
    const result = await actions.remove(owned.entryId)
    setSaving((count) => count - 1)
    if (!result.ok) {
      setProblem(errors(`errors.${result.reason}`))
      return
    }
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
    else router.push('/library')
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
              <label key={each} className={CHIP}>
                <input
                  type="radio"
                  name={`${id}-status`}
                  checked={owned.status === each}
                  onChange={() => setStatus(each)}
                  className="sr-only"
                />
                {library(`status.${each}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <SavedField
            label={t('rating')}
            value={owned.rating === undefined ? '' : String(owned.rating / 10)}
            inputMode="decimal"
            onSave={(text) => {
              const trimmed = text.trim().replace(',', '.')
              if (trimmed === '') return void update({ rating: null }, { rating: undefined })
              const score = Math.round(Number(trimmed) * 10)
              if (!Number.isFinite(score) || score < 0 || score > 100) {
                setProblem(t('ratingRange'))
                return
              }
              void update({ rating: score }, { rating: score })
            }}
          />
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
            <label className="grid gap-1.5 text-sm font-medium">
              {t('completedOn')}
              <input
                type="date"
                className={FIELD}
                value={owned.completedOn ?? ''}
                max={today()}
                onChange={(event) => {
                  const day = event.target.value || null
                  void update({ completedOn: day }, { completedOn: day ?? undefined })
                }}
              />
            </label>
          ) : null}
        </div>

        <Copies
          owned={owned}
          labels={labels}
          platforms={owned.platforms}
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

        <SavedField
          label={t('tags')}
          value={owned.tags.join(', ')}
          onSave={(text) => {
            const tags = text
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
            void update({ tags }, { tags })
          }}
        />

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
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={owned.notesPublic}
              onChange={(event) =>
                update({ notesPublic: event.target.checked }, { notesPublic: event.target.checked })
              }
              className="size-4 accent-[var(--color-accent)]"
            />
            {t('notesPublic')}
          </label>
        </div>

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

        <div className="grid justify-items-start gap-3 border-t border-line pt-4">
          {confirming ? (
            <div role="group" aria-label={t('remove')} className="grid gap-3">
              <p className="text-sm text-pretty">{t('confirmRemove', { title: owned.title })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={remove}>
                  {t('confirm')}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {t('keep')}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Trash2Icon aria-hidden="true" />
              {t('remove')}
            </Button>
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
        <textarea
          value={text}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          className={cn(FIELD, 'h-auto py-2 leading-relaxed')}
        />
      ) : (
        <input
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
          className={FIELD}
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
  onFormat,
  onRemove,
  onAdd,
}: {
  owned: OwnerGame
  labels: ReadonlyMap<number, PlatformLabel>
  platforms: readonly PlatformLabel[]
  onFormat: (copy: OwnedCopy, format: Format) => void
  onRemove: (copy: OwnedCopy) => void
  onAdd: (platformId: number, format: Format) => void
}) {
  const t = useTranslations('Edit')
  const game = useTranslations('Game')
  const library = useTranslations('Library')
  const id = useId()
  const have = new Set(owned.copies.map((copy) => `${copy.platformId}:${copy.format}`))
  const open = platforms.filter((platform) =>
    formats.some((format) => !have.has(`${platform.id}:${format}`)),
  )
  const [platform, setPlatform] = useState<number>()
  const [format, setFormat] = useState<Format>('physical')
  const chosen = platform ?? open[0]?.id

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
              <li key={copy.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="min-w-28 font-medium">{name}</span>
                <span
                  role="radiogroup"
                  aria-label={t('formatOf', { platform: name })}
                  className="flex gap-3"
                >
                  {formats.map((each) => (
                    <label key={each} className="flex min-h-10 items-center gap-2">
                      <input
                        type="radio"
                        name={`${id}-${copy.id}`}
                        checked={copy.format === each}
                        onChange={() => onFormat(copy, each)}
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      {library(`format.${each}`)}
                    </label>
                  ))}
                </span>
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
          <label className="grid gap-1.5 text-sm font-medium">
            {t('copyPlatform')}
            <select
              className={cn(FIELD, 'w-auto')}
              value={chosen}
              onChange={(event) => setPlatform(Number(event.target.value))}
            >
              {open.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('copyFormat')}
            <select
              className={FIELD}
              value={format}
              onChange={(event) => setFormat(event.target.value as Format)}
            >
              {formats.map((each) => (
                <option key={each} value={each} disabled={have.has(`${chosen}:${each}`)}>
                  {library(`format.${each}`)}
                </option>
              ))}
            </select>
          </label>
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
