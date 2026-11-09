'use client'

import { ArrowRightIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { Button } from '@/ui/button'
import { Tip } from '@/ui/tooltip'

import { platformFor } from './game-box'
import { StatusMark } from './status-mark'

type PulledGameProps = {
  /** The game whose box is out of the wall. */
  item: ShelfItem
  platforms: ReadonlyMap<number, LibraryPlatform>
  /** To the game's page. */
  onOpen: () => void
  /** The box goes back on its shelf. */
  onPutBack: () => void
}

/** Escape is the page's while typing, or inside a dialog or a menu. */
const elsewhere = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="dialog"], [role="menu"], [role="listbox"]')))

/**
 * The box pulled from the 3D wall, said in words under it (ADR 009): its
 * title, its status and its platform, with the way to its page and the way
 * to put it back. The box is the cover, so none is drawn here.
 */
export function PulledGame({ item, platforms, onOpen, onPutBack }: PulledGameProps) {
  const t = useTranslations('Library')
  const { game } = item
  const platform = platformFor(item, platforms)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || elsewhere(event.target)) return
      event.preventDefault()
      onPutBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPutBack])

  return (
    <div
      role="group"
      aria-label={game.title}
      className="sticky bottom-6 z-30 mx-auto -mt-20 flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-panel border border-line bg-surface-raised py-2 pr-2 pl-5 shadow-panel motion-safe:animate-menu-in"
    >
      <div className="min-w-0">
        <p className="truncate title text-lg">{game.title}</p>
        <p className="flex items-center gap-3 text-sm text-muted">
          <StatusMark status={game.status} label={t(`status.${game.status}`)} />
          {platform ? <span>{platform.name}</span> : null}
        </p>
      </div>
      <Button
        variant="primary"
        onClick={onOpen}
        aria-label={t('shelf3d.openGame', { title: game.title })}
      >
        {t('shelf3d.open')}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
      <Tip label={t('shelf3d.putBack')}>
        <Button variant="ghost" size="icon" onClick={onPutBack} aria-label={t('shelf3d.putBack')}>
          <XIcon aria-hidden="true" />
        </Button>
      </Tip>
    </div>
  )
}
