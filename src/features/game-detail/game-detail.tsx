import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

import type { Palette } from '@/domain/color/palette'
import { backdropSources } from '@/domain/igdb/images'
import { filterFor, namesOf, type GameFacts } from '@/domain/library/game-page'
import type { LibraryGame, LibraryPlatform, LibraryTag, Named } from '@/domain/library/library'
import type { ListKey } from '@/domain/query/keys'
import { Cover } from '@/features/library/cover'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { StatusMark } from '@/features/library/status-mark'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { cn } from '@/ui/cn'
import { Ghosts } from '@/ui/ghosts'

import { AchievementsLater } from './achievements-later'
import { HERO_COVER } from './hero'
import { MineSkeleton } from './mine-skeleton'
import { OwnerMine } from './owner-mine'
import { AdultNotice } from './adult-notice'
import { Screenshots } from './screenshots'

import './game-detail.css'

type GameDetailProps = {
  /** Whose shelf the game is on: its links lead into that shelf. */
  handle: string
  game: LibraryGame
  /** The game's tags, by name. */
  tags: readonly LibraryTag[]
  /** Names for the platforms its copies are on. */
  platforms: ReadonlyMap<number, LibraryPlatform>
  /** What only the page shows. Absent while it is on its way: those parts wait as ghosts. */
  facts?: GameFacts
  /** The facts could not be fetched: say so, and offer the game's own page. */
  failed?: boolean
  /** A page of its own, or the panel over the shelf. */
  layout: 'page' | 'panel'
  /** Off in 3D, where the box pulled from the wall is the cover (spec 7.2). */
  cover?: boolean
  /** The file the shelf already shows for this cover: there at once, while a larger one loads. */
  placeholder?: string
  /** Puts the heading where it belongs: in the panel it is the dialog's title. */
  heading?: (heading: ReactElement) => ReactElement
  /** What stands above the heading: on the page, the way back to the library. */
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
  level: Level,
  children,
  className,
  id,
}: {
  title: string
  /** One below the game's title: h2 on the page, h3 in the panel, whose title is an h2. */
  level: 'h2' | 'h3'
  children: ReactNode
  className?: string
  /** For an address to lead to it: the trophy page's unlocks lead to `#achievements`. */
  id?: string
}) {
  return (
    <section id={id} className={cn('game-section', className)}>
      <Level className="readout text-[0.6875rem] text-muted">{title}</Level>
      {children}
    </section>
  )
}

/** About this much of a passage is shown before "Read more". */
const SHOWN_CHARS = 420
/** Less than this left over is shown too: hiding a sliver is worse than showing it. */
const HIDDEN_CHARS = 200

/**
 * A passage of IGDB's text in its paragraphs, one to each line break it
 * has. A long one shows its first paragraphs, about a screen's worth, and
 * the rest behind "Read more", with no script: a closed `details` is still
 * found by the browser's search.
 */
function Passage({
  text,
  more,
  less,
  lang,
}: {
  text: string
  more: string
  less: string
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
      <details className="game-more">
        <summary lang={lang}>
          <span className="game-more-closed">{more}</span>
          <span className="game-more-open">{less}</span>
        </summary>
        <div className="game-prose">{all(rest)}</div>
      </details>
    </>
  )
}

/**
 * A game's page (spec 7.1): the cover over its key art, then what I have
 * recorded about it, what it is about, its screenshots, and what IGDB says
 * about it. The same parts make the page of its own and the panel over the
 * shelf; the panel puts them in one column.
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
  failed,
  layout,
  cover = true,
  placeholder,
  heading = (node) => node,
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
  const page = layout === 'page'

  const day = (value: string) =>
    format.dateTime(dateOf(value), { dateStyle: 'long', timeZone: 'UTC' })
  const hours = (minutes: number) => t('hours', { count: Math.max(1, hoursOf(minutes)) })

  const names = facts?.names
  const developers = names ? namesOf(names.company, game.developers) : []
  const values = (key: ListKey, list: readonly Named[] | undefined, ids: readonly number[]) =>
    list ? namesOf(list, ids).map((named) => ({ named, filter: filterFor(key, named) })) : []

  const ratio = game.coverRatio ? game.coverRatio / 100 : 0.75
  const backdrop = facts?.backdrop

  const Heading = page ? 'h1' : 'h2'
  const level = page ? 'h2' : 'h3'
  const Minor = page ? 'h3' : 'h4'
  const titleSize = page ? 'text-3xl sm:text-5xl lg:text-6xl' : 'text-2xl'

  const hero = (
    <header className="game-hero" data-layout={layout}>
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
            sizes={page ? '(min-width: 40rem) 100vw, 320px' : '320px'}
            fetchPriority={page ? 'high' : undefined}
            decoding="async"
          />
        ) : game.colors ? (
          <span className="game-wash" style={{ backgroundImage: wash(game.colors) }} />
        ) : null}
      </div>
      <div
        className={cn('game-hero-inner', page && 'mx-auto w-full max-w-360 px-4 sm:px-6 lg:px-10')}
      >
        {above}
        <div className="flex items-end gap-4 sm:gap-6">
          {cover ? (
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
                sizes={page ? '(min-width: 64rem) 256px, (min-width: 40rem) 224px, 160px' : '128px'}
                eager={page}
                placeholder={placeholder}
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 pb-1">
            {heading(
              <Heading className={cn('title text-balance break-words', titleSize)}>
                {game.title}
              </Heading>,
            )}
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

  const readOnlyMine = (
    <Section title={t('mine')} level={level} className={page ? 'game-mine' : undefined}>
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
            </ul>
          </Row>
        ) : null}
        {game.minutes > 0 ? <Row label={t('played')}>{hours(game.minutes)}</Row> : null}
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
          <Minor className="readout text-[0.625rem] text-muted">{t('notes')}</Minor>
          {facts ? (
            <p className="mt-1.5 text-sm whitespace-pre-line">{facts.notes}</p>
          ) : (
            <Ghosts lines={2} />
          )}
        </div>
      ) : null}
    </Section>
  )

  const mine = editable ? (
    <OwnerMine
      handle={handle}
      slug={game.slug}
      level={level}
      minor={Minor}
      onRemoved={onRemoved}
      refresh={page}
      skeleton={<MineSkeleton game={game} tags={tags} platforms={platforms} level={level} />}
    >
      {readOnlyMine}
    </OwnerMine>
  ) : (
    readOnlyMine
  )

  const about =
    facts && !facts.summary && !facts.storyline ? null : (
      <Section title={t('about')} level={level}>
        {facts ? (
          <div className="game-prose" lang={igdbLang}>
            {facts.summary ? (
              <Passage
                text={facts.summary}
                more={t('readMore')}
                less={t('readLess')}
                lang={locale}
              />
            ) : null}
            {facts.storyline ? (
              <>
                <Minor
                  className={cn('readout text-[0.625rem] text-muted', facts.summary && 'mt-3')}
                  lang={locale}
                >
                  {t('storyline')}
                </Minor>
                <Passage
                  text={facts.storyline}
                  more={t('readMore')}
                  less={t('readLess')}
                  lang={locale}
                />
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
      <Section title={videos.length > 0 ? t('media') : t('screenshots')} level={level}>
        {facts ? (
          <div data-adult-media={game.adult ? '' : undefined}>
            <Screenshots shots={facts.screenshots} videos={videos} title={game.title} />
          </div>
        ) : (
          <div aria-hidden="true" className="flex gap-2 overflow-hidden">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="ghost aspect-video h-24 flex-none rounded-case"
                style={{ '--i': index } as CSSProperties}
              />
            ))}
          </div>
        )}
      </Section>
    )

  // Asked for as the page opens, only for a game a provider has achievements for (issue 72).
  const achievements = facts?.achievements ? (
    <Section id="achievements" title={t('achievements.title')} level={level}>
      <AchievementsLater
        slug={game.slug}
        providers={facts.achievements}
        minor={Minor}
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
    <Section title={t('details')} level={level}>
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
          {game.igdbRating === undefined ? null : (
            <Row label={t('igdbRating')}>
              <span className="text-sm">
                {t('igdbValue', { value: game.igdbRating, count: game.igdbRatingCount })}
              </span>
            </Row>
          )}
        </dl>
      ) : (
        <Ghosts lines={5} />
      )}
    </Section>
  )

  if (page) {
    return (
      <article className="game" data-layout="page">
        {hero}
        {game.adult ? <AdultNotice /> : null}
        <div className="mx-auto grid w-full max-w-360 gap-x-12 gap-y-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-10">
          <div className="grid min-w-0 content-start gap-10">
            {about}
            {shots}
            {achievements}
            {details}
          </div>
          <aside className="row-start-1 lg:col-start-2">{mine}</aside>
        </div>
      </article>
    )
  }

  return (
    <article className="game" data-layout="panel">
      {hero}
      <div className="grid gap-7 px-5 pt-5 pb-6">
        {mine}
        {failed ? (
          <p role="alert" className="text-sm text-muted">
            {t.rich('factsFailed', {
              page: (chunks) => (
                <Link
                  href={gameHref(handle, game.slug)}
                  className="text-accent underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : (
          <>
            {about}
            {shots}
            {achievements}
            {details}
          </>
        )}
      </div>
    </article>
  )
}
