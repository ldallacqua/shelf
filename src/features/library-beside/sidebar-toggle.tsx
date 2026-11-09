'use client'

import { PanelLeftIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import {
  besidePreference,
  readPreference,
  subscribeToPreferences,
  writePreference,
} from '@/features/library/preferences'
import { Button } from '@/ui/button'

export function SidebarToggleView({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const t = useTranslations('Beside')
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 gap-2 px-3 text-muted"
      aria-expanded={shown}
      aria-controls="game-library-list"
      onClick={onToggle}
    >
      <PanelLeftIcon aria-hidden="true" />
      {t(shown ? 'hide' : 'show')}
    </Button>
  )
}

/** Kept outside the column so the same focused button can always bring the list back. */
export function SidebarToggle() {
  const choice = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(besidePreference),
    () => besidePreference.fallback,
  )
  return (
    <SidebarToggleView
      shown={choice === 'shown'}
      onToggle={() => writePreference(besidePreference, choice === 'shown' ? 'hidden' : 'shown')}
    />
  )
}
