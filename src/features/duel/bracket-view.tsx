import { CheckIcon, CrownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import type { Match, Standing } from '@/domain/duel/bracket'
import type { LibraryGame } from '@/domain/library/library'
import { thumbnailOf } from '@/domain/library/library'
import { Cover } from '@/features/library/cover'
import { cn } from '@/ui/cn'

/** One side of a duel in the bracket: its game, whether it went on, or that it isn't known yet. */
function Side({
  game,
  match,
  waiting,
}: {
  game: LibraryGame | undefined
  match: Match
  /** Shown before the duel is played: nobody has gone on. */
  waiting: string
}) {
  const t = useTranslations('Duel.bracket')
  if (!game) {
    return (
      <p className="flex min-h-8 items-center gap-2 px-1 text-xs text-muted">
        <span
          aria-hidden="true"
          className="h-7 w-5 flex-none rounded-[2px] border border-dashed border-line-strong"
        />
        {waiting}
      </p>
    )
  }
  const won = match.winner === game.slug
  const lost = match.winner !== undefined && !won
  return (
    <p
      className={cn(
        'flex min-h-8 min-w-0 items-center gap-2 px-1 text-xs',
        won && 'font-semibold',
        lost && 'text-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'block h-7 w-5 flex-none overflow-hidden rounded-[2px]',
          lost && 'opacity-50',
        )}
      >
        <Cover
          cover={thumbnailOf(game)}
          colors={game.colors}
          hash={game.hash}
          title={game.title}
          sizes="20px"
          small
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{game.title}</span>
      {won && !match.bye ? (
        <>
          <CheckIcon
            aria-hidden="true"
            strokeWidth={2.5}
            className="size-3.5 flex-none text-accent"
          />
          <span className="sr-only">{t('won')}</span>
        </>
      ) : null}
    </p>
  )
}

/**
 * The bracket (spec 3.14): every round, each duel's two games, who went on, the duel being played
 * and the ones still to be decided. Rounds stand side by side on a wide screen, each duel between
 * the two it came from, and one under another on a narrower one. The game left ends it.
 */
export function BracketView({
  standing,
  games,
}: {
  standing: Standing
  games: ReadonlyMap<string, LibraryGame>
}) {
  const t = useTranslations('Duel.bracket')
  const rounds = useTranslations('Duel.fight.round')
  const headingId = useId()
  const champion = standing.champion ? games.get(standing.champion) : undefined
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('title')}
      </h2>
      <ol className="duel-rounds">
        {standing.rounds.map((round, roundIndex) => (
          <li key={round.name} className="duel-round grid gap-2">
            <h3 className="readout text-[0.6875rem] text-muted">{rounds(round.name)}</h3>
            <ol className="duel-matches">
              {round.matches.map((match, matchIndex) => {
                const current =
                  standing.current?.round === roundIndex && standing.current.match === matchIndex
                return (
                  <li
                    key={matchIndex}
                    className="duel-match"
                    data-current={current ? '' : undefined}
                    aria-current={current ? 'step' : undefined}
                  >
                    {current ? (
                      <span className="px-1 readout text-[0.625rem] text-accent">{t('now')}</span>
                    ) : null}
                    <Side
                      game={match.a === undefined ? undefined : games.get(match.a)}
                      match={match}
                      waiting={t('tbd')}
                    />
                    {match.bye ? (
                      <p className="flex min-h-8 items-center px-1 text-xs text-muted italic">
                        {t('bye')}
                      </p>
                    ) : (
                      <Side
                        game={match.b === undefined ? undefined : games.get(match.b)}
                        match={match}
                        waiting={t('tbd')}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
        {champion ? (
          <li className="duel-round grid gap-2">
            <h3 className="readout text-[0.6875rem] text-muted">{t('champion')}</h3>
            <div className="duel-matches">
              <div className="duel-match" data-current="">
                <p className="flex min-h-8 min-w-0 items-center gap-2 px-1 text-sm font-semibold">
                  <CrownIcon aria-hidden="true" className="size-4 flex-none text-accent" />
                  <span className="min-w-0 truncate">{champion.title}</span>
                </p>
              </div>
            </div>
          </li>
        ) : null}
      </ol>
    </section>
  )
}
