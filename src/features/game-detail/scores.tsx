import { ExternalLinkIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import type { ShelfScore } from '@/domain/library/game-page'
import { steamStoreLink } from '@/domain/library/store-links'
import type { SteamReviews } from '@/domain/steam/reviews'

/** Below this many, a score is one person's taste or two: its meter says so by dimming. */
const FEW = 5

// Steam's steps, from 1 to 9, by the words the store gives each.
const STEAM_WORDS = [
  undefined,
  'overwhelminglyNegative',
  'veryNegative',
  'negative',
  'mostlyNegative',
  'mixed',
  'mostlyPositive',
  'positive',
  'veryPositive',
  'overwhelminglyPositive',
] as const

/**
 * How full, as a game's bar is: twenty segments, so a glance compares one
 * place with another while the number beside it keeps that place's own scale.
 * Only whole ones light, rounded down, so a bar is only full at a hundred.
 * Empty, it holds the place of a score still to come.
 */
function Meter({ share, few }: { share: number; few?: boolean }) {
  return (
    <span aria-hidden="true" className="game-score-meter" data-few={few ? '' : undefined}>
      <span style={{ '--score': Math.floor(share / 5) * 5 } as CSSProperties} />
    </span>
  )
}

function Source({
  name,
  url,
  value,
  unit,
  who,
  count,
  share,
  few,
}: {
  name: string
  url?: string
  value?: string
  unit?: string
  who: string
  count?: string
  share: number
  few?: boolean
}) {
  const stores = useTranslations('Stores')
  return (
    <div className="game-score">
      <dt className="game-score-source">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {name}
            <ExternalLinkIcon aria-hidden="true" className="size-3 flex-none text-muted" />
            <span className="sr-only">{stores('newTab')}</span>
          </a>
        ) : (
          name
        )}
      </dt>
      {value ? (
        <dd className="game-score-reading">
          <span className="title text-3xl">{value}</span>{' '}
          <span className="readout text-[0.625rem] text-muted">{unit}</span>
        </dd>
      ) : null}
      <dd className="game-score-bar">
        <Meter share={share} few={few} />
      </dd>
      <dd className="game-score-who">
        <span>{who}</span> {count ? <span>{count}</span> : null}
      </dd>
    </div>
  )
}

/** A source's place, while the page's facts are on their way. */
function Waiting({ index }: { index: number }) {
  const style = { '--i': index } as CSSProperties
  return (
    <div aria-hidden="true" className="game-score">
      <span className="game-score-source">
        <span className="ghost h-3.5 w-12 rounded-[2px]" style={style} />
      </span>
      <span className="game-score-reading">
        <span className="ghost h-7 w-16 rounded-[2px]" style={style} />
      </span>
      <span className="game-score-bar">
        <Meter share={0} />
      </span>
      <span className="game-score-who">
        <span className="ghost h-3 w-24 rounded-[2px]" style={style} />
      </span>
    </div>
  )
}

type ScoresProps = {
  igdb?: { rating: number; count: number; url?: string }
  steam?: SteamReviews
  shelf?: ShelfScore
  /** The page's facts are on their way: Steam and Shelf wait as ghosts. */
  waiting?: boolean
  level: 'h2' | 'h3'
}

/**
 * What others think of a game (spec 7.11), one column to a place. They are
 * never averaged into one number, and each keeps its own scale: a share of
 * people who recommend it is not a mark out of a hundred. Each says who it
 * speaks for and how many, as Rotten Tomatoes puts its count under each score.
 *
 * With nothing from anywhere, the section is not drawn.
 */
export function Scores({ igdb, steam, shelf, waiting, level: Level }: ScoresProps) {
  const t = useTranslations('Game.scores')
  const format = useFormatter()
  if (!waiting && !igdb && !steam && !shelf) return null

  const compact = (count: number) => format.number(count, { notation: 'compact' })
  const ratings = (count: number) => t('ratings', { count, shown: compact(count) })
  const word = steam ? STEAM_WORDS[steam.score] : undefined

  const columns: ReactNode[] = []
  if (igdb) {
    columns.push(
      <Source
        key="igdb"
        name={t('igdb')}
        url={igdb.url}
        value={format.number(igdb.rating)}
        unit={t('ofHundred')}
        who={t('igdbWho')}
        count={ratings(igdb.count)}
        share={igdb.rating}
        few={igdb.count < FEW}
      />,
    )
  }
  if (waiting) {
    columns.push(<Waiting key="steam" index={0} />, <Waiting key="shelf" index={1} />)
  } else {
    if (steam) {
      columns.push(
        <Source
          key="steam"
          name={t('steam')}
          url={`${steamStoreLink(steam.app).url}#app_reviews_hash`}
          value={format.number(steam.percent / 100, { style: 'percent' })}
          unit={t('positive')}
          who={word ? t(`steamWords.${word}`) : t('steamWho')}
          count={t('reviews', { count: steam.count, shown: compact(steam.count) })}
          share={steam.percent}
          few={steam.count < FEW}
        />,
      )
    }
    columns.push(
      shelf ? (
        <Source
          key="shelf"
          name={t('shelf')}
          value={format.number(shelf.rating / 10, { maximumFractionDigits: 1 })}
          unit={t('ofTen')}
          who={t('shelfWho')}
          count={ratings(shelf.count)}
          share={shelf.rating}
          few={shelf.count < FEW}
        />
      ) : (
        <Source key="shelf" name={t('shelf')} who={t('none')} share={0} />
      ),
    )
  }

  return (
    <section className="game-section">
      <Level className="readout text-[0.6875rem] text-muted">{t('title')}</Level>
      <div className="game-scores">
        <dl data-columns={columns.length}>{columns}</dl>
      </div>
    </section>
  )
}
