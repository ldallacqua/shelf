'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'

import { MAX_SHELF_NAME, type SmartShelf } from '@/domain/library/shelves'
import { Button } from '@/ui/button'
import { Sheet, SheetContent } from '@/ui/sheet'

import type { ShelfActions, ShelfWrite } from './shelf-controls'

type SaveShelfProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The shelf being changed, or none for a new one. */
  shelf?: SmartShelf
  /** What is on screen now: it is what gets saved. */
  view: { query: string; sort: string; group: string }
  actions: ShelfActions
  /** After a save: the shelf's slug. After a removal: none. */
  onDone: (slug?: string) => void
}

/**
 * Saving what is on screen as a smart shelf, for the owner: a new one with
 * a name, or the shelf being looked at, kept at its address. A shelf can
 * be removed from here too.
 */
export function SaveShelf({ open, onOpenChange, shelf, view, actions, onDone }: SaveShelfProps) {
  const t = useTranslations('Shelves')
  const nameId = useId()
  const [name, setName] = useState(shelf?.name ?? '')
  const [problem, setProblem] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [asNew, setAsNew] = useState(!shelf)

  const run = (work: () => Promise<ShelfWrite>, removing = false) =>
    startTransition(async () => {
      setProblem(undefined)
      const result = await work()
      if (result.ok) {
        onOpenChange(false)
        onDone(removing ? undefined : result.slug)
      } else {
        setProblem(t(`errors.${result.reason}`))
      }
    })

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(shelf && !asNew ? shelf.name : '')
          setProblem(undefined)
        }
        onOpenChange(next)
      }}
    >
      <SheetContent
        title={shelf && !asNew ? t('saveTitle', { name: shelf.name }) : t('newTitle')}
        description={t('saveDescription')}
        closeLabel={t('close')}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            run(() =>
              actions.save({
                ...(shelf && !asNew ? { slug: shelf.slug } : {}),
                name,
                ...view,
              }),
            )
          }}
        >
          {shelf ? (
            <div className="flex gap-2 text-sm" role="radiogroup" aria-label={t('saveHow')}>
              {(['same', 'new'] as const).map((how) => (
                <label key={how} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="how"
                    checked={(how === 'new') === asNew}
                    onChange={() => {
                      setAsNew(how === 'new')
                      setName(how === 'new' ? '' : shelf.name)
                    }}
                    className="size-4 accent-(--accent)"
                  />
                  {t(how === 'new' ? 'saveAsNew' : 'save')}
                </label>
              ))}
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">
              {t('name')}
            </label>
            <input
              id={nameId}
              required
              maxLength={MAX_SHELF_NAME}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-control border border-line-strong bg-surface px-3 text-sm pointer-coarse:h-11"
            />
          </div>
          {problem ? (
            <p role="alert" className="text-sm">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending || name.trim() === ''}>
              {shelf && !asNew ? t('save') : t('saveAsNew')}
            </Button>
            {shelf && !asNew ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => actions.remove(shelf.slug), true)}
              >
                {t('remove')}
              </Button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
