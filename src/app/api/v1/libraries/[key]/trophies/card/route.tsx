import { getTranslations } from 'next-intl/server'
import { ImageResponse } from 'next/og'

import { imageUrl } from '@/domain/igdb/images'
import { trophyCardOf, type TrophyCard } from '@/domain/library/trophy-card'
import { wallAddress } from '@/features/trophies/wall-address'
import { failure } from '@/server/api/respond'
import { getAchievementWall, languageOf } from '@/server/services/achievements'
import { findPublicLibraryByKey, getTrophyWall } from '@/server/services/library'

/**
 * `GET /api/v1/libraries/{key}/trophies/card?year=&locale=`: a public
 * shelf's trophy card (issue 68's shareable statistics), what a link to its
 * trophy page shows where it is shared: of all time, or a year's recap.
 * 1200 by 630, without adult games. The edge keeps it an hour.
 */

const WIDTH = 1200
const HEIGHT = 630

/** The dark room's own colors (`ui/tokens`). */
const ROOM = { wall: '#0b0d12', deep: '#07080c', surface: '#14171f', line: '#262b38' }
const INK = { text: '#f2f4f8', muted: '#a3abbb', accent: '#a796ff', glow: '#7c5cff' }

/** How long a cover may take before the card is drawn without it. */
const COVER_WAIT_MS = 3000

/** The first bytes of each kind of image the card draws, where the kind has them. */
const SIGNATURES: Record<string, number[] | undefined> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/svg+xml': undefined,
}

/**
 * A cover as the card can draw it: IGDB's JPEG, inline. One that does not
 * come in time, or is not what it says, is a block of its own colors
 * instead: an image the card cannot read would end the card half drawn.
 */
const coverOf = async (cover: string | undefined): Promise<string | undefined> => {
  if (!cover) return undefined
  try {
    const response = await fetch(imageUrl(cover, 'cover_big').replace(/\.webp$/, '.jpg'), {
      signal: AbortSignal.timeout(COVER_WAIT_MS),
    })
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!response.ok || !(type in SIGNATURES)) return undefined
    const bytes = Buffer.from(await response.arrayBuffer())
    const signature = SIGNATURES[type]
    if (signature && !signature.every((byte, at) => bytes[at] === byte)) return undefined
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

function Card({
  card,
  covers,
  t,
  number,
  name,
}: {
  card: TrophyCard
  covers: (string | undefined)[]
  t: Awaited<ReturnType<typeof getTranslations<'Trophies.card'>>>
  number: (value: number) => string
  name: string
}) {
  const year = card.scope === undefined ? undefined : String(card.scope)
  const title = year ? t('yearTitle', { name, year }) : t('title', { name })
  const figures = [
    card.hours > 0 ? t('hours', { count: card.hours, hours: number(card.hours) }) : undefined,
    card.genre ? t('genre', { genre: card.genre }) : undefined,
    card.unlocked
      ? t('unlocked', { count: card.unlocked, unlocked: number(card.unlocked) })
      : undefined,
    card.perfect ? t('perfect', { count: card.perfect, perfect: number(card.perfect) }) : undefined,
  ].filter((figure) => figure !== undefined)
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        padding: 64,
        color: INK.text,
        background: `radial-gradient(circle at 78% 30%, ${INK.glow}55 0%, ${ROOM.wall} 55%, ${ROOM.deep} 100%)`,
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: INK.muted }}>
          {t('brand')}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            // A longer title, a longer name or another language's words, a size down to stay on a line.
            fontSize: title.length > 24 ? 42 : 52,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 28 }}>
          <div style={{ display: 'flex', fontSize: 168, lineHeight: 1, color: INK.accent }}>
            {number(card.finished)}
          </div>
          <div style={{ display: 'flex', marginLeft: 22, fontSize: 30, color: INK.muted }}>
            {year
              ? t('finishedIn', { count: card.finished, year })
              : t('finished', { count: card.finished })}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 'auto' }}>
          {figures.map((figure) => (
            <div
              key={figure}
              style={{
                display: 'flex',
                marginRight: 14,
                marginTop: 14,
                padding: '10px 20px',
                fontSize: 26,
                border: `1px solid ${ROOM.line}`,
                borderRadius: 999,
                background: ROOM.surface,
              }}
            >
              {figure}
            </div>
          ))}
        </div>
      </div>
      {card.covers.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            width: 2 * 176 + 20,
            marginLeft: 48,
            alignContent: 'center',
          }}
        >
          {card.covers.map((each, at) => (
            <div
              key={at}
              style={{
                display: 'flex',
                width: 176,
                height: 236,
                marginRight: at % 2 === 0 ? 20 : 0,
                marginBottom: 20,
                overflow: 'hidden',
                borderRadius: 10,
                background: each.colors?.[0] ?? ROOM.surface,
                boxShadow: `0 18px 40px ${ROOM.deep}`,
              }}
            >
              {covers[at] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={covers[at]}
                  alt=""
                  width={176}
                  height={236}
                  style={{ objectFit: 'cover' }}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/libraries/[key]/trophies/card'>,
) {
  const { key } = await context.params
  const library = await findPublicLibraryByKey(key)
  if (!library) return failure(404, 'not-found', 'There is no public library at this address.')
  const query = Object.fromEntries(new URL(request.url).searchParams)
  const locale = languageOf(query.locale)
  const { scope } = wallAddress(query, new Date().getUTCFullYear())
  const [wall, achievements, t] = await Promise.all([
    getTrophyWall(library.id, scope),
    getAchievementWall(library.id, locale, { scope }),
    getTranslations({ locale, namespace: 'Trophies.card' }),
  ])
  const card = trophyCardOf(wall, achievements)
  const covers = await Promise.all(card.covers.map((each) => coverOf(each.cover)))
  const format = new Intl.NumberFormat(locale)
  return new ImageResponse(
    <Card
      card={card}
      covers={covers}
      t={t}
      number={(value) => format.format(value)}
      name={library.name}
    />,
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
