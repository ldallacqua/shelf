import { CheckIcon, ExternalLinkIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { isBuying, storeRows, type StoreRow } from '@/domain/library/game-page'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import type { StoreLink } from '@/domain/library/stores'

/**
 * Stores, one to a line: each a link to its page on the game, in a tab of its
 * own, so the shelf is still here. One IGDB lists no page on is still where I
 * keep the game.
 */
function Rows({ rows }: { rows: readonly StoreRow[] }) {
  const t = useTranslations('Stores')
  const library = useTranslations('Library')
  return (
    <ul>
      {rows.map(({ store, url, mine }) => {
        const Line = url ? 'a' : 'span'
        return (
          <li key={store}>
            <Line
              className="game-store"
              data-mine={mine ? '' : undefined}
              {...(url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className="min-w-0 truncate">{library(`store.${store}`)}</span>{' '}
              {mine ? (
                <span className="game-store-mine">
                  <CheckIcon
                    aria-hidden="true"
                    strokeWidth={2.5}
                    className="size-3.5 text-accent"
                  />
                  {t(mine)}
                </span>
              ) : null}{' '}
              {url ? (
                <>
                  <ExternalLinkIcon
                    aria-hidden="true"
                    className="ml-auto size-3.5 flex-none text-muted"
                  />
                  <span className="sr-only">{t('newTab')}</span>
                </>
              ) : null}
            </Line>
          </li>
        )
      })}
    </ul>
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
  const { rows, shown } = storeRows(game, links ?? [], platforms)
  if (links && rows.length === 0) return null
  const rest = rows.slice(shown)
  return (
    <section className="game-section">
      <Level className="readout text-[0.6875rem] text-muted">
        {t(buying ? 'whereToBuy' : 'title')}
      </Level>
      {links ? (
        <div className="game-stores">
          {shown > 0 ? <Rows rows={rows.slice(0, shown)} /> : null}
          {rest.length > 0 ? (
            <details className="game-more">
              <summary>
                <span className="game-more-closed">
                  {t(shown > 0 ? 'more' : 'all', { count: rest.length })}
                </span>
                <span className="game-more-open">{t('fewer')}</span>
              </summary>
              <Rows rows={rest} />
            </details>
          ) : null}
        </div>
      ) : (
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
      )}
    </section>
  )
}
