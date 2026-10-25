'use client'

import { useTranslations } from 'next-intl'

import { Segmented, SegmentedItem } from '@/ui/segmented'

import { ledColors, useLed } from './led-context'

/** Picks the LED color for the demo shelves. */
export function LedPicker() {
  const t = useTranslations('Foundations.light.led')
  const { led, setLed } = useLed()

  return (
    <Segmented aria-label={t('label')} value={led} onValueChange={setLed}>
      {ledColors.map((option) => (
        <SegmentedItem
          key={option.key}
          value={option.key}
          aria-label={t(`colors.${option.key}`)}
          title={t(`colors.${option.key}`)}
          className="px-0 data-[state=on]:bg-text/12"
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-full shadow-[0_0_calc(var(--glow)*10px)_var(--dot)] ring-1 ring-text/20"
            style={{ backgroundColor: option.value, ['--dot' as string]: option.value }}
          />
        </SegmentedItem>
      ))}
    </Segmented>
  )
}
