import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { getTranslations } from 'next-intl/server'

import type { TrophyCard } from '@/domain/library/trophy-card'

/**
 * The trophy card as `next/og` draws it, 1200 by 630: the latest games
 * finished stand face-out on a lit shelf, as the mark draws three cases,
 * each under a lamp of its own color as on the trophy wall; under them, the
 * games finished, large, whose they are, and the figures beside.
 */

/** The dark room's own colors (`ui/tokens`). */
const ROOM = { deep: '#06070a', line: '#262b38', surface: '#14171f', board: '#1c2030' }
const INK = {
  text: '#f2f4f8',
  muted: '#9aa3b5',
  faint: '#6b7386',
  accent: '#a796ff',
  led: '#7c5cff',
}

const COVER_WIDTH = 186
const COVER_HEIGHT = 248
const COVER_GAP = 26
/** How far down the covers stand, from the card's top: on the shelf's board. */
const SHELF_TOP = 352
/** Where each lamp hangs, above its cover. */
const LAMP_TOP = 64
/** The shelf is as wide as five covers, however many stand on it. */
const SHELF_WIDTH = 5 * COVER_WIDTH + 4 * COVER_GAP + 80

/** A cover as the card draws it: its image inline, or none, the color of its light, and its own. */
export type CardCover = { src?: string; led: string; colors?: readonly [string, string, string] }

type Words = Awaited<ReturnType<typeof getTranslations<'Trophies.card'>>>

const readFonts = async () => {
  const file = (name: string) => readFile(join(process.cwd(), 'src/ui/fonts/card', name))
  const [title, bold, mono] = await Promise.all([
    file('archivo-title.ttf'),
    file('archivo-700.ttf'),
    file('martian-mono-500.ttf'),
  ])
  return [
    { name: 'Archivo Title', data: title, weight: 800 as const, style: 'normal' as const },
    { name: 'Archivo', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Martian Mono', data: mono, weight: 500 as const, style: 'normal' as const },
  ]
}

let fonts: ReturnType<typeof readFonts> | undefined

/** The fonts the card is drawn in (`ui/fonts/README.md`), read once by each server instance. */
export const cardFonts = () => (fonts ??= readFonts())

/** The mark: three cases on a lit shelf, as `ui/logo.tsx` draws it. */
function Mark() {
  return (
    <svg width={30} height={30} viewBox="0 0 24 24">
      <rect x="2.5" y="4" width="5.5" height="12.5" rx="1" fill={INK.text} />
      <rect x="9.25" y="6.5" width="5.5" height="10" rx="1" fill={INK.text} opacity="0.7" />
      <rect x="16" y="5" width="5.5" height="11.5" rx="1" fill={INK.text} opacity="0.45" />
      <rect x="1.5" y="18.25" width="21" height="2.25" rx="1.125" fill={INK.led} />
    </svg>
  )
}

/** A cover on the shelf, its lamp above, the pool of its color falling down the wall around it. */
function Standing({ cover }: { cover: CardCover }) {
  const pool = Math.round(COVER_WIDTH * 2.4)
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: COVER_WIDTH,
        height: SHELF_TOP,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: (COVER_WIDTH - pool) / 2,
          width: pool,
          height: SHELF_TOP + 40,
          background: `radial-gradient(${pool / 2}px ${SHELF_TOP - 40}px at 50% ${LAMP_TOP}px, ${cover.led}8c 0%, ${cover.led}3d 30%, ${cover.led}14 62%, ${cover.led}00 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: LAMP_TOP,
          display: 'flex',
          width: 62,
          height: 4,
          borderRadius: 2,
          background: '#ffffff',
          boxShadow: `0 0 8px 2px ${cover.led}, 0 0 26px 10px ${cover.led}88, 0 10px 44px 16px ${cover.led}44`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: COVER_WIDTH,
          height: COVER_HEIGHT,
          borderRadius: 5,
          overflow: 'hidden',
          // A cover that did not come is a block of its own colors.
          background: cover.colors
            ? `linear-gradient(160deg, ${cover.colors[0]} 0%, ${cover.colors[2]} 100%)`
            : ROOM.surface,
          boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.08), 0 18px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        {cover.src ? (
          // Inline, as the card is drawn: next/image has no place here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.src}
            alt=""
            width={COVER_WIDTH}
            height={COVER_HEIGHT}
            style={{ objectFit: 'cover' }}
          />
        ) : null}
        {/* The lamp's light on the cover's top, fading down it. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: COVER_WIDTH,
            height: COVER_HEIGHT,
            background: `linear-gradient(180deg, ${cover.led}30 0%, ${cover.led}00 38%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.18) 100%)`,
          }}
        />
      </div>
    </div>
  )
}

/** The shelf the covers stand on: its board, and the strip of light along its front. */
function Shelf() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: SHELF_WIDTH }}>
        <div
          style={{
            display: 'flex',
            height: 10,
            borderRadius: 2,
            background: `linear-gradient(180deg, ${ROOM.board} 0%, #12151e 100%)`,
          }}
        />
        <div
          style={{
            display: 'flex',
            height: 3,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${INK.led}00 0%, ${INK.led} 18%, #b9a8ff 50%, ${INK.led} 82%, ${INK.led}00 100%)`,
            boxShadow: `0 0 18px 3px ${INK.led}aa`,
          }}
        />
        <div
          style={{
            display: 'flex',
            height: 70,
            background: `radial-gradient(ellipse closest-side at 50% 0%, ${INK.led}40 0%, ${INK.led}00 100%)`,
          }}
        />
      </div>
    </div>
  )
}

/** The games finished: smaller as it grows longer, so whose it is keeps its room beside it. */
const finishedSize = (shown: string) =>
  shown.length <= 2 ? 150 : shown.length <= 3 ? 132 : shown.length <= 5 ? 112 : 96

/** The width the words beside the games finished have, between its column and the card's edge. */
const BESIDE = 1200 - 2 * 64 - 40

/**
 * How wide a line of figures is drawn, near enough: the card cannot measure
 * its words before it draws them, so each character counts as wide as it
 * was measured in these fonts at these sizes. A value is Archivo 700 at 24
 * pixels, a label Martian Mono at 12, and each figure after the first has
 * its rule and its room.
 */
const widthOf = (figures: readonly { value: string; label: string }[]) =>
  figures.reduce(
    (sum, { value, label }, at) =>
      sum + value.length * 13.5 + 8 + label.length * 10.4 + (at ? 37 : 0),
    0,
  )

/** The games finished's column: its digits in the wide title face, or its label, the wider. */
const finishedWidth = (shown: string, label: string) =>
  Math.max(shown.length * finishedSize(shown) * 0.7, label.length * 11.6)

/**
 * The figures that fit on their line beside the games finished, as shown and
 * labelled: the last give way first, so the genre goes before the counts,
 * and the first always stays.
 */
export const fitted = <Figure extends { value: string; label: string }>(
  figures: readonly Figure[],
  finished: string,
  finishedLabel: string,
): Figure[] => {
  const room = BESIDE - finishedWidth(finished, finishedLabel)
  const shown = [...figures]
  while (shown.length > 1 && widthOf(shown) > room) shown.pop()
  return shown
}

export function CardImage({
  card,
  covers,
  t,
  number,
  name,
  site,
  locale,
}: {
  card: TrophyCard
  covers: CardCover[]
  t: Words
  number: (value: number) => string
  name: string
  /** The site's name, for its mark. */
  site: string
  locale: string
}) {
  const year = card.scope === undefined ? undefined : String(card.scope)
  const title = year ? t('yearTitle', { name, year }) : t('title', { name })
  const upper = (text: string) => text.toLocaleUpperCase(locale)
  // IGDB's short form in brackets is said by the name before it: "Role-playing (RPG)".
  const genre = card.genre?.replace(/\s*\(.*\)$/, '')
  const figures = [
    card.hours > 0
      ? { value: number(card.hours), label: t('hours', { count: card.hours }) }
      : undefined,
    card.unlocked
      ? { value: number(card.unlocked), label: t('unlocked', { count: card.unlocked }) }
      : undefined,
    card.perfect
      ? { value: number(card.perfect), label: t('perfect', { count: card.perfect }) }
      : undefined,
    // A genre's name longer than this would push the figures past the card's edge.
    genre && genre.length <= 18 ? { value: genre, label: t('genre'), before: true } : undefined,
  ].filter((figure) => figure !== undefined)
  const finished = number(card.finished)
  const finishedLabel = upper(
    year
      ? t('finishedIn', { count: card.finished, year })
      : t('finished', { count: card.finished }),
  )
  const shown = fitted(
    figures.map((figure) => ({ ...figure, label: upper(figure.label) })),
    finished,
    finishedLabel,
  )
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
        height: '100%',
        color: INK.text,
        background: `linear-gradient(180deg, #10121a 0%, #0b0d12 52%, ${ROOM.deep} 100%)`,
        fontFamily: 'Archivo',
      }}
    >
      {/* The strip's light, rising up the wall behind the covers. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: SHELF_TOP - 150,
          height: 190,
          background: `radial-gradient(ellipse closest-side at 50% 82%, ${INK.led}33 0%, ${INK.led}00 100%)`,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {covers.map((cover, at) => (
          <div key={at} style={{ display: 'flex', marginLeft: at === 0 ? 0 : COVER_GAP }}>
            <Standing cover={cover} />
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: covers.length === 0 ? SHELF_TOP : 0,
        }}
      >
        <Shelf />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 50,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Archivo Title',
              fontSize: finishedSize(finished),
              lineHeight: 0.84,
              letterSpacing: -4,
              backgroundImage: `linear-gradient(180deg, #ffffff 30%, ${INK.accent} 100%)`,
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {finished}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 14,
              fontFamily: 'Martian Mono',
              fontSize: 13,
              letterSpacing: 2.5,
              color: INK.muted,
            }}
          >
            {finishedLabel}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            marginLeft: 40,
            paddingBottom: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Mark />
            <div style={{ display: 'flex', marginLeft: 12, fontWeight: 700, fontSize: 26 }}>
              {site}
            </div>
            <div
              style={{
                display: 'flex',
                marginLeft: 16,
                paddingLeft: 16,
                borderLeft: `1px solid ${ROOM.line}`,
                fontFamily: 'Martian Mono',
                fontSize: 15,
                letterSpacing: 3,
                color: INK.muted,
              }}
            >
              {upper(t('label'))}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 14,
              fontFamily: 'Archivo Title',
              // A longer name, or another language's words, a size down to stay on its line.
              fontSize: title.length > 30 ? 30 : title.length > 22 ? 34 : 40,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', marginTop: 20 }}>
            {shown.map((figure, at) => {
              const label = (
                <div
                  style={{
                    display: 'flex',
                    margin: figure.before ? '0 8px 0 0' : '0 0 0 8px',
                    fontFamily: 'Martian Mono',
                    fontSize: 12,
                    letterSpacing: 2,
                    color: INK.faint,
                  }}
                >
                  {figure.label}
                </div>
              )
              return (
                <div
                  key={figure.label}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    paddingLeft: at === 0 ? 0 : 18,
                    marginLeft: at === 0 ? 0 : 18,
                    borderLeft: at === 0 ? 'none' : `1px solid ${ROOM.line}`,
                  }}
                >
                  {figure.before ? label : null}
                  <div style={{ display: 'flex', fontWeight: 700, fontSize: 24, lineHeight: 1 }}>
                    {figure.value}
                  </div>
                  {figure.before ? null : label}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
