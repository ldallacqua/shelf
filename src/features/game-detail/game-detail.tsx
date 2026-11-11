import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Palette } from '@/domain/color/palette'
import { backdropSources } from '@/domain/igdb/images'
import { filterFor, namesOf, type GameFacts } from '@/domain/library/game-page'
import type { LibraryGame, LibraryPlatform, LibraryTag, Named } from '@/domain/library/library'
import type { StoreName } from '@/domain/library/stores'
import type { ListKey } from '@/domain/query/keys'
import { Cover } from '@/features/library/cover'
import { Duration } from '@/features/library/duration'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { StatusMark } from '@/features/library/status-mark'
import { libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { cn } from '@/ui/cn'
import { Ghosts } from '@/ui/ghosts'

import { AchievementsLater } from './achievements-later'
import { PageDrawn } from './hand-off'
import { HERO_COVER } from './hero'
import { MineSkeleton } from './mine-skeleton'
import { MineFields } from './mine-fields'
import { OwnerMine } from './owner-mine'
import { AdultNotice } from './adult-notice'
import { GameDescription, HIDDEN_CHARS, ReadMore, SHOWN_CHARS } from './description'
import { Scores } from './scores'
import { MediaSkeleton, Screenshots } from './screenshots'
import { Stores } from './stores'

import './game-detail.css'

type GameDetailProps = {
  /** Whose shelf the game is on: its links lead into that shelf. */
  handle: string
  game: LibraryGame
  /** The game's tags, by name. */
  tags: readonly LibraryTag[]
  /** Names for the platforms its copies are on. */
  platforms: ReadonlyMap<number, LibraryPlatform>
  /**
   * What only the page knows. Absent while it is on its way, drawn from the
   * library (`hand-off.tsx`): those parts wait as ghosts.
   */
  facts?: GameFacts
  /** The file the shelf already shows for this cover: there at once, while a larger one loads. */
  placeholder?: string
  /** What stands above the heading: the way back to the library. */
  above?: ReactNode
  /** Editable by its shelf's account, once the browser knows it is theirs (spec 7.3). */
  editable?: boolean
  /** After the owner removes it: where to go. */
  onRemoved?: () => void
}

const wash = ([accent, second, base]: Palette): string =>
  `radial-gradient(70% 90% at 20% 30%, ${accent}, transparent 70%), radial-gradient(70% 90% at 85% 70%, ${second}, transparent 65%), ${base}`

/** A link to the shelf's library, filtered to what this value names. */
function FilterLink({
  handle,
  filter,
  children,
}: {
  handle: string
  filter: string
  children: ReactNode
}) {
  return (
    <Link href={libraryHref(handle, { q: filter })} className="game-value">
      {children}
    </Link>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="game-row">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function Section({
  title,
  children,
  className,
  id,
}: {
  title: string
  children: ReactNode
  className?: string
  /** For an address to lead to it: the trophy page's unlocks lead to `#achievements`. */
  id?: string
}) {
  return (
    <section id={id} className={cn('game-section', className)}>
      <h2 className="readout text-[0.6875rem] text-muted">{title}</h2>
      {children}
    </section>
  )
}

/**
 * A passage of IGDB's text in its paragraphs, one to each line break it
 * has. A long one shows its first paragraphs, about a screen's worth, and
 * the rest behind "Read more".
 */
function Passage({
  text,
  lang,
}: {
  text: string
  /** The page's language, for the button: the passage is IGDB's English. */
  lang: string
}) {
  const paragraphs = text
    .split(/\n+/)
    .map((each) => each.trim())
    .filter(Boolean)
  let shown = 0
  for (let length = 0; shown < paragraphs.length && (shown === 0 || length < SHOWN_CHARS);) {
    length += paragraphs[shown]!.length
    shown += 1
  }
  const rest = paragraphs.slice(shown)
  const all = (list: readonly string[]) =>
    list.map((paragraph, index) => <p key={index}>{paragraph}</p>)
  if (rest.join('').length < HIDDEN_CHARS) return all(paragraphs)
  return (
    <>
      {all(paragraphs.slice(0, shown))}
      <ReadMore lang={lang}>{all(rest)}</ReadMore>
    </>
  )
}

/**
 * A game's page (spec 7.1): the cover over its key art, then what I have
 * recorded about it, what it is about, its screenshots, and what IGDB says
 * about it.
 *
 * No hooks of its own beyond words and formats, so the page built ahead of
 * time draws it on the server; the screenshots' viewer is the only part
 * that needs the browser.
 */
export function GameDetail({
  handle,
  game,
  tags,
  platforms,
  facts,
  placeholder,
  above,
  editable,
  onRemoved,
}: GameDetailProps) {
  const t = useTranslations('Game')
  const library = useTranslations('Library')
  const format = useFormatter()
  const locale = useLocale()
  // IGDB writes in English. On the Portuguese site that text is marked as
  // English, so a screen reader pronounces it as English.
  const igdbLang = locale === 'en' ? undefined : 'en'

  const day = (value: string) =>
    format.dateTime(dateOf(value), { dateStyle: 'long', timeZone: 'UTC' })
  const hours = (minutes: number) => t('hours', { count: Math.max(1, hoursOf(minutes)) })

  const names = facts?.names
  const developers = names ? namesOf(names.company, game.developers) : []
  const values = (key: ListKey, list: readonly Named[] | undefined, ids: readonly number[]) =>
    list ? namesOf(list, ids).map((named) => ({ named, filter: filterFor(key, named) })) : []

  const ratio = game.coverRatio ? game.coverRatio / 100 : 0.75
  const backdrop = facts?.backdrop

  const hero = (
    <header className="game-hero">
      <div
        className="game-backdrop"
        aria-hidden="true"
        data-adult-media={game.adult ? '' : undefined}
      >
        {backdrop ? (
          // Key art straight from IGDB's servers, which resize it. Dimmed, so a
          // smaller file than the screen does no harm.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            {...backdropSources(backdrop.id)}
            // A phone takes the smaller file: dimmed as it is, its 569 pixels pass for more.
            sizes="(min-width: 40rem) 100vw, 320px"
            fetchPriority="high"
            decoding="async"
          />
        ) : game.colors ? (
          <span className="game-wash" style={{ backgroundImage: wash(game.colors) }} />
        ) : null}
      </div>
      <div className="game-hero-inner mx-auto w-full max-w-360 px-4 @min-[39rem]:px-6 @min-[63rem]:px-10">
        {above}
        <div className="game-identity">
          <span
            className="game-cover"
            style={{ aspectRatio: String(ratio) }}
            data-adult-media={game.adult ? '' : undefined}
            {...{ [HERO_COVER]: '' }}
          >
            <Cover
              cover={game.cover}
              colors={game.colors}
              hash={game.hash}
              title={game.title}
              sizes="(min-width: 64rem) 256px, (min-width: 40rem) 224px, 160px"
              eager
              placeholder={placeholder}
            />
            {/* The cover growing from the shelf lands here (`morph.ts`). */}
            <PageDrawn />
          </span>
          <div className="game-name min-w-0 pb-1">
            <h1 className="title text-3xl text-balance break-words @min-[39rem]:text-5xl @min-[63rem]:text-6xl">
              {game.title}
            </h1>
            {facts?.versionTitle ? (
              <p className="mt-2 text-sm text-muted" lang={igdbLang}>
                {facts.versionTitle}
              </p>
            ) : null}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <StatusMark
                status={game.status}
                label={library(`status.${game.status}`)}
                className="font-semibold"
              />
              {game.year ? <span className="readout text-[0.6875rem]">{game.year}</span> : null}
              {developers.length > 0 ? (
                <span className="text-muted" lang={igdbLang}>
                  {developers.map((each) => each.name).join(', ')}
                </span>
              ) : null}
            </p>
          </div>
          {facts?.summary ? (
            <p className="game-intro" lang={igdbLang}>
              {facts.summary}
            </p>
          ) : !facts ? (
            <div className="game-intro" aria-hidden="true">
              <span className="ghost block h-4 w-full rounded-control" />
              <span className="ghost mt-2 block h-4 w-4/5 rounded-control" />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )

  const owned = game.copies.flatMap((copy) => {
    const platform = platforms.get(copy.platform)
    return platform ? [{ copy, platform }] : []
  })
  // On the wishlist, where I want it (spec 7.5).
  const wanted = (game.wanted ?? []).flatMap((id) => platforms.get(id) ?? [])
  const storePill = (store: StoreName) => (
    <li key={store}>
      <FilterLink handle={handle} filter={`store:${store}`}>
        {library(`store.${store}`)}
      </FilterLink>
    </li>
  )

  const readOnlyMine = (
    <Section title={t('mine')} className="game-mine">
      <MineFields label={t('recordDetails')}>
        <dl>
          <Row label={t('status')}>
            <StatusMark status={game.status} label={library(`status.${game.status}`)} />
          </Row>
          {game.rating === undefined ? null : (
            <Row label={t('rating')}>
              <span className="title text-xl">
                {format.number(outOfTen(game.rating), { maximumFractionDigits: 1 })}
              </span>
              <span className="ml-1.5 readout text-[0.625rem] text-muted">{t('outOfTen')}</span>
            </Row>
          )}
          <Row label={t('owned')}>
            {owned.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {owned.map(({ copy, platform }) => (
                  <li key={`${copy.platform}:${copy.format}`}>
                    <FilterLink
                      handle={handle}
                      filter={`owned:${platform.key} format:${copy.format}`}
                    >
                      {t('copy', {
                        platform: platform.name,
                        format: library(`format.${copy.format}`),
                      })}
                    </FilterLink>
                  </li>
                ))}
                {[...new Set(owned.flatMap(({ copy }) => copy.stores ?? []))].map(storePill)}
              </ul>
            ) : (
              <span className="text-muted">{library('shelf.notOwned')}</span>
            )}
          </Row>
          {wanted.length > 0 ? (
            <Row label={t('wanted')}>
              <ul className="flex flex-wrap gap-1.5">
                {wanted.map((platform) => (
                  <li key={platform.id}>
                    <FilterLink handle={handle} filter={`wanted:${platform.key}`}>
                      {platform.name}
                    </FilterLink>
                  </li>
                ))}
                {(game.wantedStores ?? []).map(storePill)}
              </ul>
            </Row>
          ) : null}
          {game.minutes > 0 ? (
            <Row label={t('played')}>
              <Duration minutes={game.minutes} />
            </Row>
          ) : null}
          <Row label={t('added')}>{day(game.addedOn)}</Row>
          {game.completedOn ? <Row label={t('completed')}>{day(game.completedOn)}</Row> : null}
          {tags.length > 0 ? (
            <Row label={t('tags')}>
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li key={tag.slug}>
                    <FilterLink handle={handle} filter={`tag:${tag.slug}`}>
                      {tag.name}
                    </FilterLink>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
        </dl>
        {game.hasNotes ? (
          <div className="mt-4">
            <h3 className="readout text-[0.625rem] text-muted">{t('notes')}</h3>
            {facts ? (
              <p className="mt-1.5 text-sm whitespace-pre-line">{facts.notes}</p>
            ) : (
              <Ghosts lines={2} />
            )}
          </div>
        ) : null}
      </MineFields>
    </Section>
  )

  const mine = editable ? (
    <OwnerMine
      handle={handle}
      slug={game.slug}
      level="h2"
      minor="h3"
      onRemoved={onRemoved}
      refresh
      skeleton={<MineSkeleton game={game} tags={tags} platforms={platforms} level="h2" />}
    >
      {readOnlyMine}
    </OwnerMine>
  ) : (
    readOnlyMine
  )

  const side = (
    <div className="grid min-w-0 content-start gap-7 @min-[63rem]:gap-8">
      <Stores
        game={game}
        links={facts ? (facts.stores ?? []) : undefined}
        platforms={platforms}
        level="h2"
      />
      {mine}
    </div>
  )

  const scores = (
    <Scores
      igdb={
        game.igdbRating === undefined
          ? undefined
          : { rating: game.igdbRating, count: game.igdbRatingCount, url: facts?.igdbUrl }
      }
      steam={facts?.steamReviews}
      shelf={facts?.shelfScore}
      waiting={!facts}
      level="h2"
      game={game.slug}
    />
  )

  // Its store page's long description where it has one (ADR 010, decision 11), and IGDB's words where not.
  const longSummary = facts?.summary && (facts.summary.length > 300 || facts.summary.includes('\n'))
  const about =
    facts && !facts.description && !facts.storyline && !longSummary ? null : (
      <Section title={t('about')}>
        {facts?.description ? (
          <GameDescription
            blocks={facts.description}
            title={game.title}
            slug={game.slug}
            lang={locale}
            textLang={igdbLang}
          />
        ) : facts ? (
          <div className="game-prose" lang={igdbLang}>
            {longSummary && facts.summary ? <Passage text={facts.summary} lang={locale} /> : null}
            {facts.storyline ? (
              <>
                <h3
                  className={cn('readout text-[0.625rem] text-muted', facts.summary && 'mt-3')}
                  lang={locale}
                >
                  {t('storyline')}
                </h3>
                <Passage text={facts.storyline} lang={locale} />
              </>
            ) : null}
          </div>
        ) : (
          <Ghosts lines={4} />
        )}
      </Section>
    )

  const videos = facts?.videos ?? []
  const shots =
    facts && facts.screenshots.length === 0 && videos.length === 0 ? null : (
      <Section title={videos.length > 0 ? t('media') : t('screenshots')}>
        {facts ? (
          <div data-adult-media={game.adult ? '' : undefined}>
            <Screenshots
              game={game.slug}
              shots={facts.screenshots}
              videos={videos}
              title={game.title}
              adult={game.adult}
            />
          </div>
        ) : (
          <MediaSkeleton />
        )}
      </Section>
    )

  // Asked for as the page opens, only for a game a provider has achievements for (issue 72).
  const achievements = facts?.achievements ? (
    <Section id="achievements" title={t('achievements.title')}>
      <AchievementsLater
        slug={game.slug}
        providers={facts.achievements}
        minor="h3"
        loading={<Ghosts lines={3} />}
      />
    </Section>
  ) : null

  const releasePlatforms = new Map(names?.platform.map((platform) => [platform.id, platform]))
  /** The platforms it came out on, by the date it did, in the order the dates come. */
  const releasedOn = (releases: GameFacts['releases']) => {
    const byDate = new Map<string, LibraryPlatform[]>()
    for (const release of releases) {
      const platform = releasePlatforms.get(release.platform)
      if (!platform) continue
      const when = release.day
        ? day(release.day)
        : release.year
          ? String(release.year)
          : t('unknownDate')
      byDate.set(when, [...(byDate.get(when) ?? []), platform])
    }
    return byDate
  }
  const lists: { key: ListKey; label: string; list?: readonly Named[]; ids: readonly number[] }[] =
    [
      { key: 'genre', label: t('genres'), list: names?.genre, ids: game.genres },
      { key: 'theme', label: t('themes'), list: names?.theme, ids: game.themes },
      { key: 'mode', label: t('modes'), list: names?.mode, ids: game.modes },
      {
        key: 'perspective',
        label: t('perspectives'),
        list: names?.perspective,
        ids: game.perspectives,
      },
      { key: 'franchise', label: t('franchise'), list: names?.franchise, ids: game.franchises },
      { key: 'series', label: t('series'), list: names?.series, ids: game.series },
      { key: 'developer', label: t('developer'), list: names?.company, ids: game.developers },
      { key: 'publisher', label: t('publisher'), list: names?.company, ids: game.publishers },
    ]
  const length = facts?.length
  const ways = length
    ? (['hastily', 'normally', 'completely'] as const).flatMap((way) =>
        length[way] ? [{ way, minutes: length[way] }] : [],
      )
    : []

  const details = (
    <Section title={t('details')}>
      {facts ? (
        <dl>
          {lists.map(({ key, label, list, ids }) => {
            const shown = values(key, list, ids)
            return shown.length > 0 ? (
              <Row key={key} label={label}>
                <ul className="flex flex-wrap gap-1.5" lang={igdbLang}>
                  {shown.map(({ named, filter }) => (
                    <li key={named.id}>
                      <FilterLink handle={handle} filter={filter}>
                        {named.name}
                      </FilterLink>
                    </li>
                  ))}
                </ul>
              </Row>
            ) : null
          })}
          {facts.releases.length > 0 ? (
            <Row label={t('released')}>
              {/* One line a date, with every platform it came out on that day. */}
              <ul className="grid gap-3">
                {[...releasedOn(facts.releases)].map(([when, released]) => (
                  <li key={when} className="grid gap-1.5">
                    <span className="text-sm text-muted">{when}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {released.map((platform) => (
                        <FilterLink
                          key={platform.id}
                          handle={handle}
                          filter={`platform:${platform.key}`}
                        >
                          {platform.name}
                        </FilterLink>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
          {ways.length > 0 ? (
            <Row label={t('timeToBeat')}>
              <ul className="grid max-w-72 gap-1 text-sm">
                {ways.map(({ way, minutes }) => (
                  <li key={way} className="flex items-baseline justify-between gap-3">
                    <span className="text-muted">{t(`ways.${way}`)}</span>
                    <span>{hours(minutes)}</span>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
        </dl>
      ) : (
        <Ghosts lines={5} />
      )}
    </Section>
  )

  return (
    // Laid out by its own width, not the window's: beside the list of my library it has less.
    <article className="game @container">
      {hero}
      {game.adult ? <AdultNotice /> : null}
      {/* Positioned to paint over the hero, which would cut off the glow of a button near it. */}
      <div className="relative mx-auto grid w-full max-w-360 gap-x-12 gap-y-10 px-4 pt-6 pb-16 @min-[39rem]:px-6 @min-[63rem]:grid-cols-[minmax(0,1fr)_22rem] @min-[63rem]:px-10">
        <div className="grid min-w-0 content-start gap-10">
          {scores}
          {shots}
          {about}
          {achievements}
          {details}
        </div>
        <aside className="row-start-1 @min-[63rem]:col-start-2">{side}</aside>
      </div>
    </article>
  )
}
