'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

import { parseThemeChoice, themeChoices, type ThemeChoice } from './theme'
import { useTheme } from './use-theme'

const icons = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
} satisfies Record<ThemeChoice, unknown>

/** The header's theme control: one button that opens the three choices. */
export function ThemeSwitch() {
  const t = useTranslations('Theme')
  const { choice, setChoice } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('label')}>
          {/* Which icon shows is decided in CSS from <html data-theme>, so it is
              right on the first paint, before React knows the stored choice. */}
          <SunIcon aria-hidden="true" className="dark:hidden" />
          <MoonIcon aria-hidden="true" className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          aria-label={t('label')}
          value={choice}
          onValueChange={(value) => setChoice(parseThemeChoice(value))}
        >
          {themeChoices.map((option) => {
            const Icon = icons[option]
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <Icon aria-hidden="true" className="text-muted" />
                {t(option)}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
