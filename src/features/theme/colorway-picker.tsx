'use client'

import { useTranslations } from 'next-intl'

import { presetNames, type Preset } from '@/domain/colorway/presets'
import { ChoiceCard, ChoiceCards } from '@/ui/choice-cards'
import { cn } from '@/ui/cn'

import { useColorway } from './use-colorway'

/**
 * A colorway as a corner of the room: its wall, a button in its accent, a
 * line of text, and a shelf lit by its LED. Drawn by the room's own classes
 * inside `data-colors`, so it is that colorway in whichever theme is on. Spans
 * only, as it stands inside the card's button.
 */
export function ColorwayRoom({ colorway, className }: { colorway: Preset; className?: string }) {
  return (
    <span
      data-colors={colorway}
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

/** The colorways laid out as cards, for Settings' Appearance. Each card shows itself. */
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
  const { colorway, setColorway } = useColorway()

  return (
    <ChoiceCards
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      value={colorway}
      onValueChange={setColorway}
      className={className}
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
    </ChoiceCards>
  )
}
