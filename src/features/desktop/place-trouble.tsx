'use client'

import { CloudAlertIcon, FolderXIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/ui/popover'

import { AppWords } from './app-words'
import { saves, serviceNames, type SavePlace } from './saves'

/** How often the header asks: a look at what the app holds, which asks no service. */
const LOOK_EVERY = 10 * 1000

/**
 * What this computer's place needs from the person (ADR 008, section 8): a service that no longer takes
 * the sign-in, or full, or a folder that can't be reached. A line down isn't one: it passes by itself,
 * and what waits goes once it has.
 */
export type Trouble = { kind: 'signed-out' | 'full' | 'away'; name: string }

export const troubleOf = (place: SavePlace): Trouble | null => {
  if (place.cloud) {
    const name = serviceNames[place.cloud]
    if (place.away === 'signed-out') return { kind: 'signed-out', name }
    if (place.away === 'full') return { kind: 'full', name }
    return null
  }
  if (place.folder && !place.reachable) return { kind: 'away', name: place.folder }
  return null
}

/**
 * The button and what it opens, drawn from what it is given. Where sync apps say it, on their icon in
 * the tray and on their window, until it is fixed: Shelf's window is its pages, so the header, beside an
 * update, on every page. What fixes it is in Settings, under Saves.
 */
export function PlaceTroubleView({ trouble }: { trouble: Trouble }) {
  const t = useTranslations('PlaceTrouble')
  const Icon = trouble.kind === 'away' ? FolderXIcon : CloudAlertIcon
  const label = t(`${trouble.kind}.button`, { name: trouble.name })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="mx-1 self-center" aria-label={label}>
          <Icon aria-hidden="true" />
          {/* The icon alone where the header is narrow: the button keeps its name. */}
          <span className="hidden max-w-56 truncate lg:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div className="grid gap-1">
          <p className="font-medium text-balance">
            {t(`${trouble.kind}.title`, { name: trouble.name })}
          </p>
          <p className="text-sm text-pretty break-words text-muted">
            {t(`${trouble.kind}.body`, { name: trouble.name })}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <PopoverClose asChild>
            <Button variant="ghost" size="sm">
              {t('later')}
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button asChild variant="primary" size="sm">
              <Link href="/settings/saves">
                {trouble.kind === 'signed-out' ? t('signInAgain') : t('openSettings')}
              </Link>
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Asking() {
  const [trouble, setTrouble] = useState<Trouble | null>(null)
  // Back from Settings, where it may have been fixed: asked again at once.
  const path = usePathname()

  useEffect(() => {
    let current = true
    // An app older than saves' places refuses the question: nothing is drawn.
    const look = () => {
      if (document.hidden) return
      saves.place().then(
        (place) => {
          if (current) setTrouble(troubleOf(place))
        },
        () => undefined,
      )
    }
    look()
    const timer = setInterval(look, LOOK_EVERY)
    document.addEventListener('visibilitychange', look)
    return () => {
      current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', look)
    }
  }, [path])

  if (!trouble) return null
  return <PlaceTroubleView trouble={trouble} />
}

/** Where this computer's saves go, when it needs the person: in the header, in the app alone. */
export default function PlaceTrouble() {
  return (
    <AppWords>
      <Asking />
    </AppWords>
  )
}
