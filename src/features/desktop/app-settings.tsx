'use client'

import { useTranslations } from 'next-intl'

import { SECTIONS, titleClass } from '@/features/settings/settings-section'
import { cn } from '@/ui/cn'

import { AppWords } from './app-words'
import { StartWithWindows } from './start-with-windows'
import { ThisComputer } from './this-computer'

function Body() {
  const t = useTranslations('AppSettings')
  return (
    <>
      <h1 className={titleClass}>{t('pages.app.title')}</h1>
      <div className={cn('mt-8', SECTIONS)}>
        <StartWithWindows />
        <ThisComputer />
      </div>
    </>
  )
}

/**
 * Shelf for Windows itself, in Settings (issue 152): starting with Windows, which only the tray's
 * menu could change before, and this computer's name. Fetched only in the app.
 */
export default function AppSettings() {
  return (
    <AppWords>
      <Body />
    </AppWords>
  )
}
