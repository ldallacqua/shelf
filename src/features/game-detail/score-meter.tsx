'use client'

import { useEffect, useState, type CSSProperties } from 'react'

/**
 * The bars that have filled on the game shown: a game's page is drawn first from the library and
 * then again as the server's arrives (`hand-off.tsx`), and a bar drawn again stands at its mark
 * instead of filling a second time. Another game starts afresh, so its bars fill as it opens.
 */
let filled: { game: string; marks: Set<string> } = { game: '', marks: new Set() }

type MeterProps = {
  /** 0 to 100. */
  share: number
  /** Resting on a few scores: dimmed. */
  few?: boolean
  /** The game whose page it is on, and whose score it shows: with both, it fills once. */
  game?: string
  source?: string
}

/**
 * How full, as a game's bar is: twenty segments, so a glance compares one
 * place with another while the number beside it keeps that place's own scale.
 * Only whole ones light, rounded down, so a bar is only full at a hundred.
 * Empty, it holds the place of a score still to come.
 */
export function Meter({ share, few, game, source }: MeterProps) {
  const step = Math.floor(share / 5) * 5
  const mark = source === undefined ? undefined : `${source}:${step}`
  // Read once, as the bar joins the page. On the server, and as a page first loads, none has
  // filled, so both draw it the same.
  const [still] = useState(
    () =>
      game !== undefined && mark !== undefined && filled.game === game && filled.marks.has(mark),
  )
  useEffect(() => {
    if (game === undefined || mark === undefined) return
    if (filled.game !== game) filled = { game, marks: new Set() }
    filled.marks.add(mark)
  }, [game, mark])

  return (
    <span
      aria-hidden="true"
      className="game-score-meter"
      data-few={few ? '' : undefined}
      data-still={still ? '' : undefined}
    >
      <span style={{ '--score': step } as CSSProperties} />
    </span>
  )
}
