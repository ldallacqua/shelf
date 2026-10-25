'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { ArchivedGame } from '@/domain/library/editing'
import { BringBack } from '@/features/add-game/bring-back'
import { Cover } from '@/features/library/cover'

/**
 * My archived games (spec 7.4), the one place they are listed: each one's
 * cover, title and platforms, and Bring back. Not there at all while none
 * is archived.
 */
export function ArchivedGames() {
  const t = useTranslations('AccountPage')
  const [games, setGames] = useState<ArchivedGame[]>()

  useEffect(() => {
    let current = true
    void fetch('/api/v1/me/archived', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((answer: { games: ArchivedGame[] } | undefined) => {
        if (current && answer) setGames(answer.games)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  if (!games || games.length === 0) return null
  return (
    <section aria-labelledby="archived-games" className="grid max-w-xl gap-3">
      <h2 id="archived-games" className="title text-xl">
        {t('archived.title')}
      </h2>
      <p className="text-sm text-pretty text-muted">{t('archived.intro')}</p>
      <ul className="grid gap-3">
        {games.map((game) => (
          <li key={game.entryId} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="relative block w-10 flex-none overflow-hidden rounded-[3px] bg-text/8"
              style={{ aspectRatio: '3 / 4' }}
            >
              <Cover
                cover={game.cover}
                colors={game.colors}
                hash={game.hash}
                title={game.title}
                sizes="40px"
              />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-semibold">
                {game.title}
                {game.year ? (
                  <span className="ml-2 readout text-[0.6875rem] text-muted">{game.year}</span>
                ) : null}
              </span>
              {game.platforms.length > 0 ? (
                <span className="text-sm text-muted">
                  {t('archived.copies', { platforms: game.platforms.join(' · ') })}
                </span>
              ) : null}
            </span>
            <BringBack entryId={game.entryId} title={game.title} />
          </li>
        ))}
      </ul>
    </section>
  )
}
