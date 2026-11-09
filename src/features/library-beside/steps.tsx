'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { LibraryLink } from '@/features/game-detail/back-to-library'
import { Button } from '@/ui/button'
import { Tip } from '@/ui/tooltip'

import { stepsOf, useListOrder } from './store'

/** Where the arrows are someone else's: typing, a menu or a dialog, a control that moves by them. */
const ARROWS_TAKEN =
  '[role="dialog"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="tablist"], [role="slider"], [role="grid"], [role="tree"]'

const theirs = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    return true
  }
  if (target.closest(ARROWS_TAKEN)) return true
  // A strip that scrolls sideways (the screenshots) moves by them itself.
  for (let at: HTMLElement | null = target; at && at !== document.body; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowX
    if ((overflow === 'auto' || overflow === 'scroll') && at.scrollWidth > at.clientWidth) {
      return true
    }
  }
  return false
}

/**
 * The game before and the game after, in the order of the list of my library
 * beside the page (ADR 009, phase 2), and the left and right arrows for the
 * same: a step adds nothing to the history, as a photo viewer's does not, so
 * Back still leads to where the game was opened from. Only once the list has
 * an order: a game opened from the library, or beside the list.
 */
export function Steps({ handle, slug }: { handle: string; slug: string }) {
  const t = useTranslations('Beside')
  const order = useListOrder(handle)
  const { previous, next } = stepsOf(order?.games, slug)

  const latest = useRef({ order, previous, next })
  useEffect(() => {
    latest.current = { order, previous, next }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.shiftKey || theirs(event.target)) return
      const { order, previous, next } = latest.current
      const to =
        event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : undefined
      if (!order || !to) return
      event.preventDefault()
      order.open(to.slug, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!order) return null
  return (
    <div role="group" aria-label={t('steps')} className="ml-auto flex flex-none items-center gap-1">
      <Tip label={previous ? t('previous', { title: previous.title }) : t('noPrevious')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={previous ? t('previous', { title: previous.title }) : t('noPrevious')}
          // Still in reach of the keyboard, so its words can be heard: there is nothing before.
          aria-disabled={previous ? undefined : true}
          className="aria-disabled:opacity-40"
          onClick={() => previous && order.open(previous.slug, { replace: true })}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
      </Tip>
      <Tip label={next ? t('next', { title: next.title }) : t('noNext')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={next ? t('next', { title: next.title }) : t('noNext')}
          aria-disabled={next ? undefined : true}
          className="aria-disabled:opacity-40"
          onClick={() => next && order.open(next.slug, { replace: true })}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </Tip>
    </div>
  )
}

/**
 * What stands above a game's title: the way back to the library, and the
 * steps to the games beside it. Beside the list, the list's own way back
 * stands at its top, and the page's gives way to it (`beside.css`); the row
 * keeps its height either way, so nothing moves when the steps arrive.
 */
export function GameAbove({ handle, slug }: { handle: string; slug: string }) {
  return (
    <div className="flex min-h-10 items-center gap-3 pointer-coarse:min-h-11">
      <span className="game-back">
        <LibraryLink handle={handle} />
      </span>
      <Steps handle={handle} slug={slug} />
    </div>
  )
}
