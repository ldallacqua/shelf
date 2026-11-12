'use client'

import { RotateCcwIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { colorsOf } from '@/domain/colorway/derive'
import { presets, type OwnColorway, type Seeds } from '@/domain/colorway/presets'
import { Button } from '@/ui/button'
import { ColorField } from '@/ui/color-field'

import { SettingSwitch } from './black-switch'

/** One's own colorway made from three seeds, by the rules every preset is made by. */
export const ownFrom = (seeds: Seeds, from: OwnColorway['from']): OwnColorway => ({
  seeds,
  from,
  colors: colorsOf(seeds),
})

/**
 * The three colors of one's own colorway, under the cards while it is chosen.
 * The page is the preview: each color repaints it as it is picked, at most once
 * a frame, as a picker sends a color for every step of a drag.
 */
export function OwnColorwayEditor({
  own,
  onChange,
}: {
  own: OwnColorway
  onChange: (own: OwnColorway) => void
}) {
  const t = useTranslations('Settings.colors')
  const pending = useRef<Seeds | null>(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const pick = (seed: 'accent' | 'room' | 'led', color: string) => {
    pending.current = { ...(pending.current ?? own.seeds), [seed]: color.toLowerCase() }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const seeds = pending.current
      pending.current = null
      if (seeds) onChange(ownFrom(seeds, own.from))
    })
  }

  return (
    <section
      aria-labelledby="own-colors-title"
      className="grid max-w-3xl gap-5 rounded-panel border border-line bg-surface p-4 sm:p-5"
    >
      <div className="grid gap-1.5">
        <h3 id="own-colors-title" className="text-base font-medium text-text">
          {t('own.title')}
        </h3>
        <p className="max-w-xl text-sm text-pretty text-muted">{t('own.body')}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <ColorField
          label={t('own.accent.label')}
          hint={t('own.accent.hint')}
          value={own.seeds.accent}
          onValueChange={(color) => pick('accent', color)}
        />
        <ColorField
          label={t('own.room.label')}
          hint={t('own.room.hint')}
          value={own.seeds.room}
          onValueChange={(color) => pick('room', color)}
        />
        <ColorField
          label={t('own.light.label')}
          hint={t('own.light.hint')}
          value={own.seeds.led}
          onValueChange={(color) => pick('led', color)}
        />
      </div>
      <SettingSwitch
        label={t('own.pastel.label')}
        hint={t('own.pastel.hint')}
        checked={own.seeds.pastel === true}
        onCheckedChange={(pastel) => {
          const { pastel: _, ...seeds } = own.seeds
          onChange(ownFrom(pastel ? { ...seeds, pastel: true } : seeds, own.from))
        }}
      />
      <Button
        variant="ghost"
        className="w-fit"
        onClick={() => onChange(ownFrom(presets[own.from], own.from))}
      >
        <RotateCcwIcon aria-hidden="true" />
        {t('own.reset', { preset: t(`presets.${own.from}.name`) })}
      </Button>
    </section>
  )
}
