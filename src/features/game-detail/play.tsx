'use client'

import { PlayIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { SteamApps } from '@/domain/library/editing'
import { steamPlayLink } from '@/domain/sync/steam'
import { Button } from '@/ui/button'

/**
 * Play, on my own game (spec 7.7). A browser cannot start a file, so here it
 * is what a browser can do: open Steam on a game the Steam sync found I own.
 * Not on a phone, which has no Steam to open.
 */
export function Play({ steam }: { steam?: SteamApps }) {
  const t = useTranslations('Edit')
  const link = steam?.owned ? steamPlayLink(steam.owned) : undefined
  if (!link) return null
  return (
    <Button asChild variant="primary" size="sm" className="pointer-coarse:hidden">
      <a href={link}>
        <PlayIcon aria-hidden="true" />
        {t('playOnSteam')}
      </a>
    </Button>
  )
}
