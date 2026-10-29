import { TrophyIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, type ReactNode, useId } from 'react'

import {
  RARITY_BELOW,
  type AchievementStats,
  type Rarity,
  type VaultItem,
} from '@/domain/library/trophy-achievements'
import type { Measure } from '@/domain/library/trophy-taste'
import { Cover } from '@/features/library/cover'
import { dateOf } from '@/features/library/format'
import { gameHref, trophiesHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { AsTable, Columns, scopeHref, Section, withFilter } from './chart-parts'

/**
 * The trophy page's achievements (issue 68's third phase): how many are
 * unlocked and how rare they are, year by year, by genre, the records and
 * milestones among them; then the trophy vault, the rarest and the latest
 * unlocks, of a rarity when one is chosen, and the games perfected and nearly
 * so. From what Steam last said, and drawn without a script, as the rest of
 * the page is. Each unlock and game leads to its game's achievements.
 */

type Props = { stats: AchievementStats; handle: string; q?: string; by: Measure }

/** Where the vault is, so a rarity chosen without a script lands on it. */
const VAULT = 'trophy-vault'

/** Under this share an unlock glows, as on a game's page and in Steam's own library. */
const RARE = RARITY_BELOW.rare

/** The trophy page with the vault kept to a rarity, or to none, the rest of the address kept. */
const vaultHref = (
  handle: string,
  stats: AchievementStats,
  q: string | undefined,
  by: Measure,
  rarity?: Rarity,
) => {
  const query: Record<string, string> = {}
  if (stats.scope !== undefined) query.year = String(stats.scope)
  if (q?.trim()) query.q = q.trim()
  if (by !== 'finished') query.by = by
  if (rarity) query.rarity = rarity
  return { ...trophiesHref(handle, query), hash: VAULT }
}

/** A game's page, at its achievements. */
const achievementsOf = (handle: string, slug: string) => ({
  ...gameHref(handle, slug),
  hash: 'achievements',
})

/** A share of Steam's players, as a game's page says one: to a tenth. */
function useShare() {
  const format = useFormatter()
  return (rate: number) => format.number(rate / 100, { style: 'percent', maximumFractionDigits: 1 })
}

/** How long, in the largest unit that says it in a few: hours, days, months or years. */
function useLasted() {
  const t = useTranslations('Trophies.achievements')
  return (ms: number) => {
    const hours = ms / 3_600_000
    if (hours < 48) return t('lastedHours', { count: Math.floor(hours) })
    const days = hours / 24
    if (days < 60) return t('lastedDays', { count: Math.round(days) })
    if (days < 730) return t('lastedMonths', { count: Math.round(days / 30.44) })
    return t('lastedYears', { count: Math.round(days / 365.25) })
  }
}

function Figure({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="trophy-figure">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="mt-1.5">
        {children}
        {note ? (
          <span className="mt-0.5 block readout text-[0.625rem] text-muted">{note}</span>
        ) : null}
      </dd>
    </div>
  )
}

function Record({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="trophy-record">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="mt-1.5 min-w-0">
        <span className="line-clamp-2 title text-lg text-balance">{children}</span>
        {note ? <span className="readout text-[0.625rem] text-muted">{note}</span> : null}
      </dd>
    </div>
  )
}

/** How many are unlocked and perfected, how rare the average one is, and the score they make. */
function Figures({ stats }: { stats: AchievementStats }) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const share = useShare()
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  const scoped = stats.scope !== undefined
  return (
    <>
      <dl className="trophy-figures trophy-achievement-figures">
        <Figure
          label={scoped ? t('unlockedIn', { year: String(stats.scope) }) : t('unlocked')}
          note={
            stats.available === undefined
              ? t('inGames', { count: stats.games })
              : t('ofAvailable', { percent: percent(stats.percent! / 100), count: stats.available })
          }
        >
          <span className="title text-4xl tabular-nums sm:text-5xl">
            {format.number(stats.unlocked)}
          </span>
        </Figure>
        <Figure
          label={scoped ? t('perfectIn', { year: String(stats.scope) }) : t('perfect')}
          note={
            stats.perfectShare === undefined
              ? undefined
              : t('perfectShare', { share: percent(stats.perfectShare) })
          }
        >
          <span className="title text-3xl tabular-nums sm:text-4xl">
            {format.number(stats.perfect)}
          </span>
        </Figure>
        {stats.averageRate === undefined ? null : (
          <Figure label={t('average')} note={t('averageNote')}>
            <span className="title text-3xl tabular-nums sm:text-4xl">
              {share(stats.averageRate)}
            </span>
          </Figure>
        )}
        {stats.score > 0 ? (
          <Figure label={t('score')} note={t('scoreNote')}>
            <span className="title text-3xl tabular-nums sm:text-4xl">
              {format.number(stats.score)}
            </span>
          </Figure>
        ) : null}
      </dl>
      {stats.score > 0 ? (
        <p className="max-w-prose text-xs text-pretty text-muted">{t('scoreHow')}</p>
      ) : null}
    </>
  )
}

/** Unlocks each year, each a way to its page; of a year, each of its months. */
function Trend({ stats, handle, q, by }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  if (stats.trend.length < 2 && stats.scope === undefined) return null
  const monthName = (month: number, style: 'short' | 'long') =>
    format.dateTime(dateOf(`2000-${String(month).padStart(2, '0')}-01`), {
      month: style,
      timeZone: 'UTC',
    })
  const busiest = Math.max(...stats.trend.map((each) => each.count))
  const columns = stats.trend.map((each) => {
    const label = each.month === undefined ? String(each.year) : monthName(each.month, 'short')
    const says =
      each.month === undefined
        ? t('yearSays', { year: String(each.year), count: each.count })
        : t('monthSays', { month: monthName(each.month, 'long'), count: each.count })
    return {
      key: `${each.year}-${each.month ?? ''}`,
      label,
      value: each.count,
      says,
      // A year leads to its page; a month has no page of its own.
      href: each.month === undefined ? scopeHref(handle, each.year, q, by) : undefined,
      labelled: each.count > 0 && each.count === busiest,
    }
  })
  const title = stats.scope === undefined ? t('years') : t('months')
  return (
    <div className="min-w-0">
      <h3 className="readout text-[0.625rem] text-muted">{title}</h3>
      <div className="mt-3">
        <Columns columns={columns} emphasis={false} />
      </div>
      <AsTable
        caption={title}
        head={[stats.scope === undefined ? t('year') : t('month'), t('unlockedHead')]}
        rows={stats.trend.map((each) => [
          each.month === undefined ? String(each.year) : monthName(each.month, 'long'),
          format.number(each.count),
        ])}
      />
    </div>
  )
}

/** The genres whose achievements I unlock most of, each a way to the page kept to it. */
function Genres({ stats, handle, q, by }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const id = useId()
  if (stats.genres.length === 0) return null
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {t('genres')}
      </h3>
      <ol className="trophy-ranked">
        {stats.genres.map((genre) => (
          <li key={genre.id}>
            <Link
              href={scopeHref(handle, stats.scope, withFilter(`genre:${genre.slug}`, q), by)}
              aria-label={t('genreSays', {
                name: genre.name,
                share: percent(genre.share),
                available: genre.available,
                games: genre.games,
              })}
              className="trophy-ranked-row"
              style={{ '--value': genre.share } as CSSProperties}
            >
              <span aria-hidden="true" className="truncate text-sm font-medium">
                {genre.name}
              </span>
              <span aria-hidden="true" className="readout text-[0.6875rem] tabular-nums">
                {percent(genre.share)}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
              <span aria-hidden="true" className="readout text-[0.5625rem] text-muted">
                {t('genreGames', { count: genre.games })}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The records among the unlocks: the best day, the most days in a row, the quickest and slowest perfect. */
function Records({ stats, handle }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const lasted = useLasted()
  const { records } = stats
  const day = (value: string) =>
    format.dateTime(dateOf(value), { dateStyle: 'medium', timeZone: 'UTC' })
  const game = (slug: string, title: string) => (
    <Link href={achievementsOf(handle, slug)} className="underline-offset-4 hover:underline">
      {title}
    </Link>
  )
  const shown = [
    records.bestDay ? (
      <Record
        key="best-day"
        label={t('bestDay')}
        note={t('bestDayNote', { count: records.bestDay.count, title: records.bestDay.game.title })}
      >
        {day(records.bestDay.on)}
      </Record>
    ) : null,
    records.streak ? (
      <Record
        key="streak"
        label={t('streak')}
        note={t('span', { from: day(records.streak.from), to: day(records.streak.to) })}
      >
        {t('days', { count: records.streak.days })}
      </Record>
    ) : null,
    records.quickest ? (
      <Record
        key="quickest"
        label={t('quickest')}
        note={t('took', { lasted: lasted(records.quickest.took), count: records.quickest.total })}
      >
        {game(records.quickest.slug, records.quickest.title)}
      </Record>
    ) : null,
    records.slowest ? (
      <Record
        key="slowest"
        label={t('slowest')}
        note={t('took', { lasted: lasted(records.slowest.took), count: records.slowest.total })}
      >
        {game(records.slowest.slug, records.slowest.title)}
      </Record>
    ) : null,
  ].filter((record) => record !== null)
  if (shown.length === 0) return null
  return <dl className="trophy-records">{shown}</dl>
}

/** The unlocks worth marking, the earliest first: the 1st, the 100th…, the first perfect game. */
function Milestones({ stats, handle }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const share = useShare()
  const id = useId()
  if (stats.milestones.length === 0) return null
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {t('milestones')}
      </h3>
      <ol className="trophy-achievement-milestones">
        {stats.milestones.map((milestone) => (
          <li key={milestone.kind === 'unlock' ? `unlock-${milestone.nth}` : milestone.kind}>
            <span className="readout text-[0.5625rem] text-muted">
              {milestone.kind === 'unlock'
                ? t('nth', { nth: milestone.nth })
                : milestone.kind === 'perfect'
                  ? t('firstPerfect')
                  : t('firstUltra', { share: share(milestone.rate) })}
            </span>
            <span className="min-w-0 text-sm text-balance">
              {milestone.kind === 'perfect' ? null : (
                <span lang={milestone.inEnglish ? 'en' : undefined} className="font-medium">
                  {milestone.name}
                </span>
              )}
              {milestone.kind === 'perfect' ? null : (
                <span className="text-muted">{t('inGame')}</span>
              )}
              <Link
                href={achievementsOf(handle, milestone.game.slug)}
                className={
                  milestone.kind === 'perfect'
                    ? 'font-medium underline-offset-4 hover:underline'
                    : 'text-muted underline-offset-4 hover:underline'
                }
              >
                {milestone.game.title}
              </Link>
            </span>
            <span className="readout text-[0.5625rem] text-muted">
              {format.dateTime(dateOf(milestone.on), { dateStyle: 'medium', timeZone: 'UTC' })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** How many are unlocked, year by year and by genre, and the records and milestones among them. */
export function Achievements(props: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const { stats } = props
  return (
    <Section
      title={t('title')}
      aside={
        stats.readAt === undefined ? undefined : (
          <p className="readout text-[0.625rem] text-muted">
            {t('from', { date: format.dateTime(new Date(stats.readAt), { dateStyle: 'medium' }) })}
          </p>
        )
      }
    >
      <Figures stats={stats} />
      {/* The years with the records under them, beside the genres' longer list. */}
      <div className="trophy-achievement-charts">
        <div className="grid min-w-0 content-start gap-8">
          <Trend {...props} />
          <Records {...props} />
        </div>
        <Genres {...props} />
      </div>
      <Milestones {...props} />
    </Section>
  )
}

/** One unlock in the vault: its artwork, glowing when rare, its name, its game, how rare and when. */
function Unlock({ unlock, handle }: { unlock: VaultItem; handle: string }) {
  const t = useTranslations('Trophies.vault')
  const format = useFormatter()
  const share = useShare()
  const rare = unlock.rate !== undefined && unlock.rate < RARE
  const when =
    unlock.at === undefined
      ? undefined
      : format.dateTime(new Date(unlock.at), { dateStyle: 'medium' })
  const said = [
    t('unlockSays', { name: unlock.name, game: unlock.game.title }),
    unlock.rate === undefined ? undefined : t('share', { share: share(unlock.rate) }),
    when ? t('unlockedOn', { date: when }) : undefined,
  ]
  return (
    <li className="min-w-0">
      <Link
        href={achievementsOf(handle, unlock.game.slug)}
        aria-label={said.filter(Boolean).join(', ')}
        className="trophy-unlock"
      >
        <span aria-hidden="true" className="trophy-unlock-art" data-rare={rare ? '' : undefined}>
          {unlock.icon ? (
            // Steam's artwork, at its own size: next/image would only add a request.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={unlock.icon} alt="" width={64} height={64} loading="lazy" decoding="async" />
          ) : (
            <TrophyIcon className="size-4" />
          )}
        </span>
        <span aria-hidden="true" className="grid min-w-0 gap-0.5">
          <span
            lang={unlock.inEnglish ? 'en' : undefined}
            className="line-clamp-2 text-sm font-medium text-balance"
          >
            {unlock.name}
          </span>
          <span className="truncate text-xs text-muted">{unlock.game.title}</span>
          <span className="flex flex-wrap gap-x-2 readout text-[0.5625rem] text-muted">
            {unlock.rate === undefined ? null : (
              <span className="whitespace-nowrap">{share(unlock.rate)}</span>
            )}
            {when ? <span className="whitespace-nowrap">{when}</span> : null}
          </span>
        </span>
      </Link>
    </li>
  )
}

function Unlocks({
  title,
  unlocks,
  handle,
}: {
  title: string
  unlocks: readonly VaultItem[]
  handle: string
}) {
  const t = useTranslations('Trophies.vault')
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
      {unlocks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('none')}</p>
      ) : (
        <ol className="trophy-unlocks">
          {unlocks.map((unlock) => (
            <Unlock key={unlock.key} unlock={unlock} handle={handle} />
          ))}
        </ol>
      )}
    </section>
  )
}

/** The unlocks of each rarity, the rarest first, each a way to keep the vault to it. */
function Rarities({ stats, handle, q, by }: Props) {
  const t = useTranslations('Trophies.vault')
  const format = useFormatter()
  const busiest = Math.max(...stats.rarities.map((each) => each.count))
  return (
    <div className="min-w-0">
      <h3 className="readout text-[0.625rem] text-muted">{t('rarities')}</h3>
      <div className="mt-3">
        <Columns
          emphasis={stats.rarity !== undefined}
          columns={stats.rarities.map(({ rarity, count }) => ({
            key: rarity,
            label: t(`short.${rarity}`),
            value: count,
            says: t('raritySays', {
              rarity: t(`names.${rarity}`),
              range: t(`ranges.${rarity}`),
              count,
            }),
            href: vaultHref(handle, stats, q, by, stats.rarity === rarity ? undefined : rarity),
            current: stats.rarity === rarity,
            labelled: count > 0 && count === busiest,
          }))}
        />
      </div>
      <AsTable
        caption={t('rarities')}
        head={[t('rarity'), t('unlocksHead')]}
        rows={stats.rarities.map(({ rarity, count }) => [
          `${t(`names.${rarity}`)} (${t(`ranges.${rarity}`)})`,
          format.number(count),
        ])}
      />
    </div>
  )
}

/** The games with every achievement unlocked, the latest first, face-out. */
function Perfects({ stats, handle }: Props) {
  const t = useTranslations('Trophies.vault')
  const format = useFormatter()
  const id = useId()
  if (stats.perfects.length === 0) return null
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {t('perfects', { count: stats.perfect })}
      </h3>
      <ol className="trophy-perfects">
        {stats.perfects.map((game) => (
          <li key={game.slug} className="min-w-0" data-adult={game.adult ? '' : undefined}>
            <Link href={achievementsOf(handle, game.slug)} className="trophy-perfect">
              <span className="trophy-perfect-cover">
                <Cover
                  cover={game.cover}
                  colors={game.colors}
                  hash={game.hash}
                  title={game.title}
                  sizes="96px"
                  small
                />
              </span>
              <span aria-hidden="true" className="line-clamp-2 text-xs font-medium text-balance">
                {game.title}
              </span>
            </Link>
            <p className="mt-0.5 readout text-[0.5625rem] text-muted">
              {game.on
                ? t('perfectedOn', {
                    count: game.total,
                    date: format.dateTime(dateOf(game.on), {
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }),
                  })
                : t('allOf', { count: game.total })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The games a few achievements short of perfect, the fewest left first. */
function Close({ stats, handle }: Props) {
  const t = useTranslations('Trophies.vault')
  const id = useId()
  if (stats.close.length === 0) return null
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {t('close')}
      </h3>
      <ol className="trophy-ranked">
        {stats.close.map((game) => (
          <li key={game.slug}>
            <Link
              href={achievementsOf(handle, game.slug)}
              aria-label={t('closeSays', {
                title: game.title,
                earned: game.earned,
                total: game.total,
                count: game.total - game.earned,
              })}
              className="trophy-ranked-row"
              style={{ '--value': game.earned / game.total } as CSSProperties}
            >
              <span aria-hidden="true" className="truncate text-sm font-medium">
                {game.title}
              </span>
              <span aria-hidden="true" className="readout text-[0.6875rem] tabular-nums">
                {t('closeOf', { earned: game.earned, total: game.total })}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
              <span aria-hidden="true" className="readout text-[0.5625rem] text-muted">
                {t('left', { count: game.total - game.earned })}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The trophy vault: the rarest and the latest unlocks, of a rarity when one is chosen, and the games perfected. */
export function Vault(props: Props) {
  const t = useTranslations('Trophies.vault')
  const { stats, handle, q, by } = props
  return (
    <section id={VAULT} aria-labelledby={`${VAULT}-title`} className="trophy-section trophy-vault">
      <div className="trophy-section-head">
        <h2 id={`${VAULT}-title`} className="title text-xl sm:text-2xl">
          {t('title')}
        </h2>
        {stats.rarity ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {t('keptTo', {
              rarity: t(`names.${stats.rarity}`),
              range: t(`ranges.${stats.rarity}`),
            })}
            <Link
              href={vaultHref(handle, stats, q, by)}
              className="trophy-chip readout text-[0.6875rem]"
              scroll={false}
            >
              {t('every')}
            </Link>
          </p>
        ) : null}
      </div>
      {/* The rarities above the lists they keep, and beside them the games nearly perfect. */}
      <div className="trophy-achievement-charts">
        {stats.rarities.some((each) => each.count > 0) ? <Rarities {...props} /> : null}
        <Close {...props} />
      </div>
      <div className="trophy-vault-lists">
        <Unlocks title={t('rarest')} unlocks={stats.rarest} handle={handle} />
        <Unlocks title={t('latest')} unlocks={stats.latest} handle={handle} />
      </div>
      <Perfects {...props} />
    </section>
  )
}
