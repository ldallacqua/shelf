'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Segmented, SegmentedItem } from '@/ui/segmented'

import { themeChoices, type ThemeChoice } from './theme'
import { useTheme } from './use-theme'

const icons = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
} satisfies Record<ThemeChoice, unknown>

/** The three theme choices laid out in a row, for use inside a page. */
export function ThemePicker({ className }: { className?: string }) {
  const t = useTranslations('Theme')
  const { choice, setChoice } = useTheme()

  return (
    <Segmented
      aria-label={t('label')}
      value={choice}
      onValueChange={setChoice}
      className={className}
    >
      {themeChoices.map((option) => {
        const Icon = icons[option]
        return (
          <SegmentedItem key={option} value={option}>
            <Icon aria-hidden="true" />
            {t(option)}
          </SegmentedItem>
        )
      })}
    </Segmented>
  )
}
