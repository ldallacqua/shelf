'use client'

import { useEffect, useRef, type FocusEvent, type PointerEvent } from 'react'

import type { Palette } from '@/domain/color/palette'
import { restOn } from '@/features/theme/follow-game'

/**
 * The game in focus on the wall, in the list or among the banners, for
 * following the game (issue 206). Those views keep no state for it, and needn't:
 * one set of handlers on the grid reads which cell the pointer or the keyboard
 * is in from the place each cell already names for assistive technology
 * (`aria-posinset` from 1, a table's `aria-rowindex` from 2, its heading being
 * 1), and hands its colors on without drawing anything again.
 */
export function useFollowOnHover(colorsAt: (index: number) => Palette | undefined) {
  const colors = useRef(colorsAt)
  useEffect(() => {
    colors.current = colorsAt
  })
  // Leaving the view (another view, another page) gives the room back.
  useEffect(() => () => restOn(undefined), [])

  const at = (target: EventTarget | null): Palette | undefined => {
    const cell = target instanceof Element ? target.closest('[data-cell]') : null
    if (!cell) return undefined
    const position = cell.getAttribute('aria-posinset')
    const row = cell.getAttribute('aria-rowindex')
    const index = position ? Number(position) - 1 : row ? Number(row) - 2 : undefined
    return index === undefined ? undefined : colors.current(index)
  }

  return {
    onPointerOver: (event: PointerEvent<HTMLElement>) => {
      // A finger has no hover: a touch opens the game, whose page follows it.
      if (event.pointerType === 'touch') return
      const palette = at(event.target)
      if (palette) restOn(palette)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') restOn(undefined)
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const palette = at(event.target)
      if (palette) restOn(palette)
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) restOn(undefined)
    },
  }
}
