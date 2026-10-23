'use client'

import { ChevronDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'

import { toggleCollapsed, useCollapsed } from './collapsed'

/**
 * Folds a shelf away, or shows it again (spec 3.7), beside its name: on
 * anything wider than a phone, where shelves stack down the page. What it
 * folds is the shelf's `[data-shelf-body]`, named by `controls`.
 */
export function FoldToggle({
  shelfKey,
  name,
  controls,
}: {
  shelfKey: string
  /** The shelf's name, as its heading shows it. */
  name: string
  /** The id of what folds away. */
  controls: string
}) {
  const t = useTranslations('Library')
  const folded = useCollapsed().has(shelfKey)
  return (
    <button
      type="button"
      className="fold-toggle"
      aria-expanded={!folded}
      aria-controls={controls}
      aria-label={t(folded ? 'shelf.unfold' : 'shelf.fold', { shelf: name })}
      onClick={() => toggleCollapsed(shelfKey)}
    >
      <ChevronDownIcon aria-hidden="true" className={cn('size-4', folded && '-rotate-90')} />
    </button>
  )
}

/** A shelf's games, folded away when this device has folded the shelf. */
export function FoldBody({
  shelfKey,
  id,
  children,
}: {
  shelfKey: string
  /** What its `FoldToggle` names in `controls`. */
  id: string
  children: ReactNode
}) {
  const folded = useCollapsed().has(shelfKey)
  return (
    <div id={id} data-shelf-body="" hidden={folded}>
      {children}
    </div>
  )
}
