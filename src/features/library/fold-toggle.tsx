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

/** Whether what holds `element` is folded away here: wider than a phone, by CSS. */
export const foldedAway = (element: Element): boolean => {
  const body = element.closest('[data-shelf-body]')
  return body !== null && getComputedStyle(body).display === 'none'
}

/**
 * A shelf's games, folded away when this device has folded the shelf: wider than a phone only,
 * by CSS (`shelf.css`). A phone shows one shelf at a time and can't unfold one, so a shelf folded
 * on a wider screen shows its games there. The `hidden` attribute did that by the letter, but
 * Tailwind's preflight hides `[hidden]` with `!important`, so the shelf drew nothing on a phone,
 * in a narrow window or at 250% zoom (step 10's review, 01, finding 47).
 */
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
    <div id={id} data-shelf-body="" data-folded={folded ? '' : undefined}>
      {children}
    </div>
  )
}
