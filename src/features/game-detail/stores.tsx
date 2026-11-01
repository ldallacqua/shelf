import { CheckIcon, ExternalLinkIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { isBuying, storeRows, type StoreRow } from '@/domain/library/game-page'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import type { StoreLink } from '@/domain/library/stores'

/** One store: a link to its page on the game, in a tab of its own, so the shelf is still here. */
function Row({ row }: { row: StoreRow }) {
  const t = useTranslations('Stores')
  const library = useTranslations('Library')
  const content = (
    <>
      <span className="min-w-0 truncate">{library(`store.${row.store}`)}</span>{' '}
      {row.mine ? (
        <span className="game-store-mine">
          <CheckIcon aria-hidden="true" strokeWidth={2.5} className="size-3.5 text-accent" />
          {t(row.mine)}
        </span>
      ) : null}
    </>
  )
  return (
    <li>
      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="game-store"
          data-mine={row.mine ? '' : undefined}
        >
          {content}{' '}
          <ExternalLinkIcon aria-hidden="true" className="ml-auto size-3.5 flex-none text-muted" />
          <span className="sr-only">{t('newTab')}</span>
        </a>
      ) : (
        // A store IGDB lists no page on: still where I keep it.
        <span className="game-store" data-mine="">
          {content}
        </span>
      )}
    </li>
  )
}

type StoresProps = {
  game: Pick<LibraryGame, 'status' | 'copies' | 'wanted' | 'wantedStores'>
  /** Absent while the game's facts are on their way. */
  links?: readonly StoreLink[]
  platforms: ReadonlyMap<number, LibraryPlatform>
  level: 'h2' | 'h3'
}

/**
 * Where to get the game (spec 7.9), a card at the head of the column beside
 * what I keep about it: open a game to buy it and the link is there, unhunted
 * for. The rest stays behind a fold with no script, like "Read more".
 */
export function Stores({ game, links, platforms, level: Level }: StoresProps) {
  const t = useTranslations('Stores')
  const buying = isBuying(game)
  const title = t(buying ? 'whereToBuy' : 'title')

  if (!links) {
    return (
      <section className="game-section">
        <Level className="readout text-[0.6875rem] text-muted">{title}</Level>
        <div aria-hidden="true" className="game-stores">
          {Array.from({ length: buying ? 4 : 2 }, (_, index) => (
            <span key={index} className="game-store">
              <span
                className="ghost h-3.5 w-28 rounded-[2px]"
                style={{ '--i': index } as CSSProperties}
              />
            </span>
          ))}
        </div>
      </section>
    )
  }

  const { rows, shown } = storeRows(game, links, platforms)
  if (rows.length === 0) return null
  const first = rows.slice(0, shown)
  const rest = rows.slice(shown)
  return (
    <section className="game-section">
      <Level className="readout text-[0.6875rem] text-muted">{title}</Level>
      <div className="game-stores">
        {first.length > 0 ? (
          <ul>
            {first.map((row) => (
              <Row key={row.store} row={row} />
            ))}
          </ul>
        ) : null}
        {rest.length > 0 ? (
          <details className="game-more">
            <summary>
              <span className="game-more-closed">
                {first.length > 0
                  ? t('more', { count: rest.length })
                  : t('all', { count: rest.length })}
              </span>
              <span className="game-more-open">{t('fewer')}</span>
            </summary>
            <ul>
              {rest.map((row) => (
                <Row key={row.store} row={row} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  )
}
