'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import {
  besidePreference,
  readPreference,
  subscribeToPreferences,
  writePreference,
} from '@/features/library/preferences'
import { PanelToggle } from '@/ui/panel-toggle'

/** Kept outside the column so the same focused button can always bring the list back. */
export function SidebarToggle() {
  const t = useTranslations('Beside')
  // Unknown on the server: the choice is on <html>, put there before the first paint.
  const choice = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(besidePreference),
    () => undefined,
  )
  return (
    <PanelToggle
      shown={choice === undefined ? undefined : choice === 'shown'}
      controls="game-library-list"
      onToggle={() => writePreference(besidePreference, choice === 'hidden' ? 'shown' : 'hidden')}
    >
      {choice === undefined ? (
        // Until the page is alive, the words follow the choice by CSS, as the list does.
        <>
          <span className="game-list-hidden:hidden">{t('hide')}</span>
          <span className="hidden game-list-hidden:inline">{t('show')}</span>
        </>
      ) : (
        t(choice === 'shown' ? 'hide' : 'show')
      )}
    </PanelToggle>
  )
}
