'use client'

import { useTranslations } from 'next-intl'

import { blankCases } from './blank-cases'
import { DemoShelf } from './demo-shelf'
import { useLed } from './led-context'

const scenes = [
  { theme: 'light', time: 'day' },
  { theme: 'dark', time: 'night' },
] as const

const cases = blankCases.slice(0, 5)

/** The same shelf with the room lights on and off, side by side, whatever the page's theme. */
export function LightScenes() {
  const t = useTranslations('Foundations.light')
  const { color } = useLed()

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {scenes.map((scene) => (
        <figure
          key={scene.theme}
          data-theme={scene.theme}
          className="room rounded-panel border border-line px-4 pt-4 pb-12 sm:px-6"
        >
          <figcaption className="readout text-[0.6875rem] text-muted">{t(scene.time)}</figcaption>
          <DemoShelf
            cases={cases}
            maxScale={0.9}
            led={color}
            description={t('sceneLabel', { time: scene.time })}
            label={t('shelfLabel')}
            className="mt-6"
          />
        </figure>
      ))}
    </div>
  )
}
