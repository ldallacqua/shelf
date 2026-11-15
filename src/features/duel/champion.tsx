'use client'

import { PlayIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

import { beatenBy, type Standing } from '@/domain/duel/bracket'
import { ledFrom } from '@/domain/color/palette'
import { coverFit, ratioOfCover } from '@/domain/library/cover-fit'
import type { LibraryGame } from '@/domain/library/library'
import { Cover } from '@/features/library/cover'
import { gameHref } from '@/features/library/shelf-address'
import { StatusMark } from '@/features/library/status-mark'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

/** Setting the game left to Playing, and how that went. */
export type StartPlaying = () => Promise<boolean>

type ChampionProps = {
  handle: string
  game: LibraryGame
  standing: Standing
  games: ReadonlyMap<string, LibraryGame>
  /** The last duel was just played here: focus moves to the game left, so it is heard. */
  arrived: boolean
  onStart: StartPlaying
  /** Takes the final back: the last choice, like any other, can be undone. */
  onUndo: () => void
  onAgain: () => void
  onOther: () => void
}

/**
 * The game left (spec 3.14): its cover lit, the duels it won and against whom, and what to do next.
 * Start playing it sets it to Playing on my shelf, said in words once saved, or that it couldn't
 * be; a game already Playing says so instead. Undo the final takes the last choice back while the
 * game left isn't Playing: once it is, the choice was acted on; Duel again
 * puts the same games in a new draw; Change the games goes back to choosing, with these still
 * chosen. Focus comes to the heading, which says "Your next game" and its title.
 */
export function Champion({
  handle,
  game,
  standing,
  games,
  arrived,
  onStart,
  onUndo,
  onAgain,
  onOther,
}: ChampionProps) {
  const t = useTranslations('Duel.champion')
  const format = useFormatter()
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const page = useRef<HTMLAnchorElement>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    if (arrived) heading.current?.focus()
  }, [arrived])

  const beaten = beatenBy(standing, game.slug)
    .map((slug) => games.get(slug)?.title)
    .filter((title): title is string => title !== undefined)
  const runnerUp = standing.runnerUp ? games.get(standing.runnerUp) : undefined
  const led = game.colors ? ledFrom(game.colors[0]) : undefined
  const playing = game.status === 'playing'

  const start = async () => {
    if (saving === 'saving') return
    setSaving('saving')
    const saved = await onStart()
    setSaving(saved ? 'saved' : 'failed')
    // The button pressed goes once saved: focus goes on to what comes next, its page.
    if (saved) requestAnimationFrame(() => page.current?.focus())
  }

  return (
    <section aria-labelledby={headingId} className="duel-champion">
      {/* The heading beside it names the game: the cover is for the eye. */}
      <span
        aria-hidden="true"
        className="duel-niche"
        style={{ '--case-led': led } as CSSProperties}
      >
        <span className="duel-cover">
          <Cover
            cover={game.cover}
            colors={game.colors}
            hash={game.hash}
            title={game.title}
            sizes="(min-width: 64rem) 272px, (min-width: 40rem) 240px, 208px"
            eager
            fit={coverFit(ratioOfCover(game.cover, game.coverRatio))}
          />
        </span>
        <span aria-hidden="true" className="duel-plinth" />
      </span>

      <div className="grid min-w-0 gap-4">
        <div className="grid gap-3">
          <h2 id={headingId} ref={heading} tabIndex={-1} className="grid gap-3 outline-none">
            <span className="readout text-[0.6875rem] text-accent">{t('label')}</span>
            <span className="title text-4xl text-balance sm:text-5xl lg:text-6xl">
              {game.title}
            </span>
          </h2>
          {beaten.length > 0 ? (
            <p className="max-w-2xl text-base text-pretty text-muted sm:text-lg">
              {t('beat', {
                count: beaten.length,
                games: format.list(beaten, { type: 'conjunction' }),
              })}
            </p>
          ) : null}
          {runnerUp ? (
            <p className="text-sm text-muted">{t('runnerUp', { title: runnerUp.title })}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {playing && saving !== 'saved' ? (
            <p className="inline-flex min-h-10 items-center pr-2 text-sm font-medium">
              <StatusMark status="playing" label={t('already')} />
            </p>
          ) : saving === 'saved' ? null : (
            <Button
              variant="primary"
              onClick={start}
              aria-disabled={saving === 'saving' ? true : undefined}
            >
              <PlayIcon aria-hidden="true" />
              {saving === 'saving' ? t('starting') : t('start')}
            </Button>
          )}
          <Button variant={saving === 'saved' ? 'primary' : 'secondary'} asChild>
            <Link ref={page} href={gameHref(handle, game.slug)}>
              {t('open')}
            </Link>
          </Button>
        </div>
        <p role="status" className="min-h-[1lh] text-sm">
          {saving === 'saved' ? (
            <StatusMark status="playing" label={t('started', { title: game.title })} />
          ) : saving === 'failed' ? (
            t('failed', { title: game.title })
          ) : null}
        </p>

        <div className="flex flex-wrap gap-1 border-t border-line pt-4">
          {saving === 'saved' || playing ? null : (
            <Button variant="ghost" size="sm" onClick={onUndo}>
              <Undo2Icon aria-hidden="true" />
              {t('undo')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onAgain}>
            <RotateCcwIcon aria-hidden="true" />
            {t('again')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onOther}>
            {t('other')}
          </Button>
        </div>
      </div>
    </section>
  )
}
