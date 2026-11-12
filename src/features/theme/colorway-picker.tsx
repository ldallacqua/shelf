'use client'

import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { colorsOf } from '@/domain/colorway/derive'
import { DEFAULT_PRESET, isPreset, OWN, presetNames, type Colorway } from '@/domain/colorway/names'
import { colorTokens, presets, type Colors } from '@/domain/colorway/presets'
import { ChoiceCard, ChoiceCards } from '@/ui/choice-cards'
import { cn } from '@/ui/cn'

import { OwnColorwayEditor, ownFrom } from './own-colorway'
import { useColorway } from './use-colorway'

/** One's own colors as the properties colorways.css reads them from, for one element. */
export const ownStyle = (colors: Colors): CSSProperties =>
  Object.fromEntries([
    ...(['light', 'dark'] as const).flatMap((theme) =>
      colorTokens.map((token) => [`--own-${theme}-${token}`, colors[theme][token]]),
    ),
    ['--own-led', colors.led],
  ]) as CSSProperties

/**
 * A colorway as a corner of the room: its wall, a button in its accent, a
 * line of text, and a shelf lit by its LED. Drawn by the room's own classes
 * inside `data-colors`, so it is that colorway in whichever theme is on. Spans
 * only, as it stands inside the card's button. One's own takes its colors in
 * `style` (`ownStyle`).
 */
export function ColorwayRoom({
  colorway,
  className,
  style,
}: {
  colorway: Colorway
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      data-colors={colorway}
      style={style}
      className={cn('relative block h-24 overflow-hidden bg-wall px-3 pt-3', className)}
    >
      <span className="flex items-center gap-2">
        <span className="block h-4 w-9 rounded-[4px] bg-accent" />
        <span className="block h-1.5 w-12 rounded-full bg-muted" />
      </span>
      <span className="mt-2 block h-1.5 w-16 rounded-full bg-text" />
      <span className="bay absolute inset-x-3 bottom-3 block">
        <span className="bay-glow block" />
        <span className="bay-items block h-5" />
        <span className="ledge block" />
      </span>
    </span>
  )
}

/**
 * The colorways laid out as cards, for Settings' Appearance, each showing
 * itself, and last one's own. Chosen, one's own opens its three colors under
 * the cards; made the first time from the preset on screen.
 */
export function ColorwayPicker({
  labelledBy,
  describedBy,
  className,
}: {
  /** The id of the heading that names the choice. */
  labelledBy: string
  /** The id of the words that say what it changes. */
  describedBy?: string
  className?: string
}) {
  const t = useTranslations('Settings.colors')
  const { colorway, own, setColorway, setOwnColorway } = useColorway()
  // Until one's own is made, its card shows what it would start from.
  const startFrom = isPreset(colorway) ? colorway : DEFAULT_PRESET
  const ownColors = own?.colors ?? colorsOf(presets[startFrom])

  const choose = (next: Colorway) => {
    if (next !== OWN) return setColorway(next)
    setOwnColorway(own ?? ownFrom(presets[startFrom], startFrom))
  }

  return (
    <div className={cn('grid gap-5', className)}>
      <ChoiceCards
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        value={colorway}
        onValueChange={choose}
      >
        {presetNames.map((name) => (
          <ChoiceCard
            key={name}
            value={name}
            label={t(`presets.${name}.name`)}
            detail={t(`presets.${name}.detail`)}
            picture={<ColorwayRoom colorway={name} />}
          />
        ))}
        <ChoiceCard
          value={OWN}
          label={t('own.name')}
          detail={t('own.detail')}
          picture={<ColorwayRoom colorway={OWN} style={ownStyle(ownColors)} />}
        />
      </ChoiceCards>
      {colorway === OWN && own ? <OwnColorwayEditor own={own} onChange={setOwnColorway} /> : null}
    </div>
  )
}
