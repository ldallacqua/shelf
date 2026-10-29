import { TrophyIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

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

import {
  AsTable,
  Chapter,
  Columns,
  Fact,
  Kpi,
  Kpis,
  Panel,
  RankedHead,
  RankedRows,
  scopeHref,
  withFilter,
} from './chart-parts'

/**
 * The trophy page's achievements (issue 68's third phase), in two chapters:
 * how many are unlocked and how rare they are, year by year, by genre, the
 * records and milestones among them; then the trophy vault, the rarest and
 * the latest unlocks, of a rarity when one is chosen, and the games perfected
 * and nearly so. From what Steam last said, and drawn without a script, as
 * the rest of the page is. Each unlock and game leads to its game's
 * achievements.
 */

type Props = {
  stats: AchievementStats
  handle: string
  q?: string
  by: Measure
  /** Of the second set of figures on a page that draws two (`chapterId`). */
  suffix?: string
}

/** Where the vault is, so a rarity chosen without a script lands on it. */
export const VAULT = 'trophy-vault'

/** Under this share an unlock glows, as on a game's page and in Steam's own library. */
const RARE = RARITY_BELOW.rare

/** The trophy page with the vault kept to a rarity, or to none, the rest of the address kept. */
const vaultHref = (
  handle: string,
  stats: AchievementStats,
  q: string | undefined,
  by: Measure,
  suffix: string,
  rarity?: Rarity,
) => {
  const query: Record<string, string> = {}
  if (stats.scope !== undefined) query.year = String(stats.scope)
  if (q?.trim()) query.q = q.trim()
  if (by !== 'finished') query.by = by
  if (rarity) query.rarity = rarity
  return { ...trophiesHref(handle, query), hash: `${VAULT}${suffix}` }
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

/** How many are unlocked and perfected, how rare the average one is, and the score they make. */
function Figures({ stats }: { stats: AchievementStats }) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const share = useShare()
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  const scoped = stats.scope !== undefined
  const number = (text: string) => <span className="trophy-kpi-number">{text}</span>
  const rest = [stats.averageRate !== undefined, stats.score > 0].filter(Boolean).length
  return (
    <>
      <Kpis columns={2 + rest}>
        <Kpi
          label={scoped ? t('unlockedIn', { year: String(stats.scope) }) : t('unlocked')}
          value={number(format.number(stats.unlocked))}
          note={
            stats.available === undefined
              ? t('inGames', { count: stats.games })
              : t('ofAvailable', { percent: percent(stats.percent! / 100), count: stats.available })
          }
        />
        <Kpi
          label={scoped ? t('perfectIn', { year: String(stats.scope) }) : t('perfect')}
          value={number(format.number(stats.perfect))}
          note={
            stats.perfectShare === undefined
              ? undefined
              : t('perfectShare', { share: percent(stats.perfectShare) })
          }
        />
        {stats.averageRate === undefined ? null : (
          <Kpi
            label={t('average')}
            value={number(share(stats.averageRate))}
            note={t('averageNote')}
            wide={rest === 1}
          />
        )}
        {stats.score > 0 ? (
          <Kpi
            label={t('score')}
            value={number(format.number(stats.score))}
            note={t('scoreNote')}
            wide={rest === 1}
          />
        ) : null}
      </Kpis>
      {stats.score > 0 ? <p className="trophy-board-note">{t('scoreHow')}</p> : null}
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
    <Panel title={title} span={8}>
      <Columns columns={columns} emphasis={false} />
      <div className="trophy-panel-foot">
        <AsTable
          caption={title}
          head={[stats.scope === undefined ? t('year') : t('month'), t('unlockedHead')]}
          rows={stats.trend.map((each) => [
            each.month === undefined ? String(each.year) : monthName(each.month, 'long'),
            format.number(each.count),
          ])}
        />
      </div>
    </Panel>
  )
}

/**
 * The genres whose achievements I unlock most of, each a way to the page
 * kept to it: `tall` beside the years and the records under them.
 */
function Genres({ stats, handle, q, by, tall }: Props & { tall: boolean }) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  if (stats.genres.length === 0) return null
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  return (
    <Panel title={t('genres')} span={4} rows={tall ? 2 : undefined}>
      <RankedRows figures={2}>
        <RankedHead figure={t('unlockedHead')} beside={t('gamesHead')} />
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
              <span aria-hidden="true" className="trophy-ranked-name">
                {genre.name}
              </span>
              <span aria-hidden="true" className="trophy-ranked-figure">
                {percent(genre.share)}
              </span>
              <span aria-hidden="true" className="trophy-ranked-beside">
                {format.number(genre.games)}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
            </Link>
          </li>
        ))}
      </RankedRows>
    </Panel>
  )
}

/** The records among the unlocks, as cards: the best day, the most days in a row, the quickest and slowest perfect. */
function Records({ stats, handle }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const lasted = useLasted()
  const { records } = stats
  const day = (value: string) =>
    format.dateTime(dateOf(value), { dateStyle: 'medium', timeZone: 'UTC' })
  const game = (slug: string, title: string) => (
    <Link href={achievementsOf(handle, slug)} className="trophy-fact-link">
      {title}
    </Link>
  )
  const shown = [
    records.bestDay ? (
      <Fact
        key="best-day"
        label={t('bestDay')}
        note={t('bestDayNote', { count: records.bestDay.count, title: records.bestDay.game.title })}
      >
        {day(records.bestDay.on)}
      </Fact>
    ) : null,
    records.streak ? (
      <Fact
        key="streak"
        label={t('streak')}
        note={t('span', { from: day(records.streak.from), to: day(records.streak.to) })}
      >
        {t('days', { count: records.streak.days })}
      </Fact>
    ) : null,
    records.quickest ? (
      <Fact
        key="quickest"
        label={t('quickest')}
        note={t('took', { lasted: lasted(records.quickest.took), count: records.quickest.total })}
      >
        {game(records.quickest.slug, records.quickest.title)}
      </Fact>
    ) : null,
    records.slowest ? (
      <Fact
        key="slowest"
        label={t('slowest')}
        note={t('took', { lasted: lasted(records.slowest.took), count: records.slowest.total })}
      >
        {game(records.slowest.slug, records.slowest.title)}
      </Fact>
    ) : null,
  ].filter((record) => record !== null)
  if (shown.length === 0) return null
  return (
    <dl className="trophy-facts" data-span={8}>
      {shown}
    </dl>
  )
}

/** The unlocks worth marking, the earliest first: the 1st, the 100th…, the first perfect game. */
function Milestones({ stats, handle }: Props) {
  const t = useTranslations('Trophies.achievements')
  const format = useFormatter()
  const share = useShare()
  if (stats.milestones.length === 0) return null
  return (
    <Panel title={t('milestones')}>
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
            <span className="trophy-milestone-day">
              {format.dateTime(dateOf(milestone.on), { dateStyle: 'medium', timeZone: 'UTC' })}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/**
 * The achievements' chapter: how many are unlocked, year by year and by
 * genre, and the records and milestones among them.
 */
export function Achievements({ id, ...props }: Props & { id: string }) {
  const t = useTranslations('Trophies.achievements')
  const chapters = useTranslations('Trophies.chapters')
  const format = useFormatter()
  const { stats } = props
  const records = Object.values(stats.records).some(Boolean)
  const trend = stats.trend.length >= 2 || stats.scope !== undefined
  return (
    <Chapter
      id={id}
      title={t('title')}
      lede={chapters('achievements.lede')}
      aside={
        stats.readAt === undefined ? undefined : (
          <p className="trophy-chapter-aside">
            {t('from', { date: format.dateTime(new Date(stats.readAt), { dateStyle: 'medium' }) })}
          </p>
        )
      }
    >
      <Figures stats={stats} />
      {/* The years with the records under them, beside the genres' longer list. */}
      <Trend {...props} />
      <Genres {...props} tall={trend && records} />
      <Records {...props} />
      <Milestones {...props} />
    </Chapter>
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
  return (
    <Panel title={title} span={6}>
      {unlocks.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : (
        <ol className="trophy-unlocks">
          {unlocks.map((unlock) => (
            <Unlock key={unlock.key} unlock={unlock} handle={handle} />
          ))}
        </ol>
      )}
    </Panel>
  )
}

/** The unlocks of each rarity, the rarest first, each a way to keep the vault to it. */
function Rarities({ stats, handle, q, by, suffix = '', wide }: Props & { wide: boolean }) {
  const t = useTranslations('Trophies.vault')
  const format = useFormatter()
  const busiest = Math.max(...stats.rarities.map((each) => each.count))
  return (
    <Panel title={t('rarities')} caption={t('raritiesHint')} span={wide ? 12 : 7}>
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
          href: vaultHref(
            handle,
            stats,
            q,
            by,
            suffix,
            stats.rarity === rarity ? undefined : rarity,
          ),
          current: stats.rarity === rarity,
          labelled: count > 0 && count === busiest,
        }))}
      />
      <div className="trophy-panel-foot">
        <AsTable
          caption={t('rarities')}
          head={[t('rarity'), t('unlocksHead')]}
          rows={stats.rarities.map(({ rarity, count }) => [
            `${t(`names.${rarity}`)} (${t(`ranges.${rarity}`)})`,
            format.number(count),
          ])}
        />
      </div>
    </Panel>
  )
}

/** The games with every achievement unlocked, the latest first, face-out. */
function Perfects({ stats, handle }: Props) {
  const t = useTranslations('Trophies.vault')
  const format = useFormatter()
  if (stats.perfects.length === 0) return null
  return (
    <Panel title={t('perfects', { count: stats.perfect })}>
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
            <p className="trophy-perfect-note">
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
    </Panel>
  )
}

/** The games a few achievements short of perfect, the fewest left first. */
function Close({ stats, handle, wide }: Props & { wide: boolean }) {
  const t = useTranslations('Trophies.vault')
  if (stats.close.length === 0) return null
  return (
    <Panel title={t('close')} span={wide ? 12 : 5}>
      <RankedRows figures={2}>
        <RankedHead figure={t('unlocksHead')} beside={t('leftHead')} />
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
              <span aria-hidden="true" className="trophy-ranked-name">
                {game.title}
              </span>
              <span aria-hidden="true" className="trophy-ranked-figure">
                {t('closeOf', { earned: game.earned, total: game.total })}
              </span>
              <span aria-hidden="true" className="trophy-ranked-beside">
                {game.total - game.earned}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
            </Link>
          </li>
        ))}
      </RankedRows>
    </Panel>
  )
}

/**
 * The trophy vault's chapter: the unlocks by rarity, which keep the lists to
 * one when chosen, and beside them the games nearly perfect; the rarest and
 * the latest unlocks; and the games perfected, face-out.
 */
export function Vault(props: Props) {
  const t = useTranslations('Trophies.vault')
  const chapters = useTranslations('Trophies.chapters')
  const { stats, handle, q, by, suffix = '' } = props
  const rarities = stats.rarities.some((each) => each.count > 0)
  const close = stats.close.length > 0
  return (
    <Chapter
      id={`${VAULT}${suffix}`}
      title={t('title')}
      lede={chapters('vault.lede')}
      aside={
        stats.rarity ? (
          <p className="trophy-chapter-aside flex flex-wrap items-center gap-x-3 gap-y-1">
            {t('keptTo', {
              rarity: t(`names.${stats.rarity}`),
              range: t(`ranges.${stats.rarity}`),
            })}
            <Link
              href={vaultHref(handle, stats, q, by, suffix)}
              className="trophy-chip readout text-[0.6875rem]"
              scroll={false}
            >
              {t('every')}
            </Link>
          </p>
        ) : undefined
      }
    >
      {rarities ? <Rarities {...props} wide={!close} /> : null}
      <Close {...props} wide={!rarities} />
      <Unlocks title={t('rarest')} unlocks={stats.rarest} handle={handle} />
      <Unlocks title={t('latest')} unlocks={stats.latest} handle={handle} />
      <Perfects {...props} />
    </Chapter>
  )
}
