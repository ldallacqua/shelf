'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { shortcutsOn } from '@/features/filters/shortcuts'
import { useOwner } from '@/features/owner/owner'
import { Button } from '@/ui/button'

import type { AddActions } from './actions'
import type { AddGame as AddGameType } from './add-game'

let code: Promise<typeof AddGameType> | undefined

/** The sheet's code, fetched when the owner first reaches for it. */
const loadSheet = () => (code ??= import('./add-game').then((module) => module.AddGame))

const wanted = new Set<() => void>()

/** Opens the sheet from anywhere: the empty library's "Add your first game". */
export const openAddGame = () => {
  for (const open of wanted) open()
}

/** Whether a key press is someone typing, or meant for something already open. */
const busyElsewhere = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="dialog"], [role="menu"]')))

/** The header's Add button (spec 2): there for the owner only, once the browser knows it is them. */
export function AddButton({ actions }: { actions: AddActions }) {
  const t = useTranslations('Add')
  const owner = useOwner().status === 'owner'
  const [AddGame, setAddGame] = useState<typeof AddGameType>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!owner) return
    const show = () =>
      void loadSheet().then((sheet) => {
        setAddGame(() => sheet)
        setOpen(true)
      })
    // `A` adds a game (spec 3.11), as long as single letters are on.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'a' && event.key !== 'A') return
      if (event.metaKey || event.ctrlKey || event.altKey || busyElsewhere(event.target)) return
      if (!shortcutsOn()) return
      event.preventDefault()
      show()
    }
    wanted.add(show)
    window.addEventListener('keydown', onKey)
    return () => {
      wanted.delete(show)
      window.removeEventListener('keydown', onKey)
    }
  }, [owner])

  if (!owner) return null
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        className="mr-1 max-sm:px-2.5"
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        onClick={openAddGame}
      >
        <PlusIcon aria-hidden="true" />
        <span className="max-sm:sr-only">{t('addButton')}</span>
      </Button>
      {AddGame ? <AddGame open={open} onOpenChange={setOpen} actions={actions} /> : null}
    </>
  )
}
