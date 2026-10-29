import { getTranslations } from 'next-intl/server'
import { ImageResponse } from 'next/og'

import { ledFrom } from '@/domain/color/palette'
import { imageUrl } from '@/domain/igdb/images'
import { trophyCardOf } from '@/domain/library/trophy-card'
import { wallAddress } from '@/features/trophies/wall-address'
import { failure } from '@/server/api/respond'
import { getAchievementWall, languageOf } from '@/server/services/achievements'
import { findPublicLibraryByKey, getTrophyWall } from '@/server/services/library'

import { CardImage, cardFonts } from './card-image'

/**
 * `GET /api/v1/libraries/{key}/trophies/card?year=&locale=`: a public
 * shelf's trophy card (issue 68's shareable statistics), what a link to its
 * trophy page shows where it is shared: of all time, or a year's recap.
 * 1200 by 630, without adult games (`card-image.tsx` draws it). The edge
 * keeps it an hour.
 */

const WIDTH = 1200
const HEIGHT = 630

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
  const [wall, achievements, t, meta, fonts] = await Promise.all([
    getTrophyWall(library.id, scope),
    getAchievementWall(library.id, locale, { scope }),
    getTranslations({ locale, namespace: 'Trophies.card' }),
    getTranslations({ locale, namespace: 'Meta' }),
    cardFonts(),
  ])
  const card = trophyCardOf(wall, achievements)
  const covers = await Promise.all(
    card.covers.map(async ({ cover, colors }) => ({
      src: await coverOf(cover),
      // Each cover under a lamp of its own color, as on the trophy wall; a gray one under white.
      led: colors ? ledFrom(colors[0]) : '#cdd5ff',
      colors,
    })),
  )
  const format = new Intl.NumberFormat(locale)
  return new ImageResponse(
    <CardImage
      card={card}
      covers={covers}
      t={t}
      number={(value) => format.format(value)}
      name={library.name}
      site={meta('siteName')}
      locale={locale}
    />,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
