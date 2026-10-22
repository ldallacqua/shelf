import { CheckIcon, ClipboardPasteIcon, SearchIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { imageUrl } from '@/domain/igdb/images'

import type { DemoGame } from './demo-case'
import { Scene } from './scene'

const step = (value: number) => ({ '--step': value }) as CSSProperties

/** A cover the size of a line in a list. */
function Thumb({ game }: { game: DemoGame }) {
  return (
    // Covers come straight from IGDB's servers, which already resize and cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      // 36 pixels wide: the smallest file is sharp enough on any screen.
      src={imageUrl(game.cover, 'cover_small')}
      loading="lazy"
      decoding="async"
      className="h-12 w-9 flex-none rounded-[3px] object-cover"
      style={{ backgroundColor: game.colors[2] }}
    />
  )
}

/**
 * Adding, played out: a few letters typed, and the games they find; then a
 * pasted list, a game a line, and each line matched to its game. Both are
 * pictures of the real sheet, with the example shelf's covers.
 */
export function AddDemo({
  query,
  found,
  pasted,
}: {
  /** What is typed into the search. */
  query: string
  /** What it finds. The first is the one added. */
  found: readonly DemoGame[]
  /** The pasted list, line by line, and the game each line is matched to. */
  pasted: readonly { line: string; game: DemoGame }[]
}) {
  const t = useTranslations('Landing.add')
  const letters = [...query]
  return (
    <Scene className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
      <figure className="min-w-0 rounded-panel border border-line bg-surface/80 p-4">
        <figcaption className="readout text-[0.6875rem] text-muted">{t('one')}</figcaption>
        <div className="mt-3 flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
          <SearchIcon aria-hidden="true" className="size-4 text-muted" />
          <span className="font-mono text-sm">
            <span className="sr-only">{query}</span>
            {letters.map((letter, index) => (
              <span key={index} aria-hidden="true" className="scene-step" style={step(index * 0.5)}>
                {letter}
              </span>
            ))}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {found.map((game, index) => (
            <li
              key={game.slug}
              className="scene-step flex items-center gap-3 rounded-control px-2 py-1.5 data-first:bg-surface-raised"
              data-first={index === 0 ? '' : undefined}
              style={step(letters.length * 0.5 + 1 + index * 0.5)}
            >
              <Thumb game={game} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{game.title}</span>
                <span className="block text-xs text-muted">
                  {game.year}
                  {' · '}
                  {game.platform}
                </span>
              </span>
              {index === 0 ? (
                <span
                  className="scene-step inline-flex flex-none items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-on-accent"
                  style={step(letters.length * 0.5 + 3)}
                >
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                  {t('added')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </figure>

      <figure className="min-w-0 rounded-panel border border-line bg-surface/80 p-4">
        <figcaption className="readout text-[0.6875rem] text-muted">{t('many')}</figcaption>
        <div className="mt-3 flex items-start gap-2 rounded-control border border-dashed border-line-strong bg-surface px-3 py-2.5">
          <ClipboardPasteIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" />
          <pre className="font-mono text-xs leading-5 text-text">
            {pasted.map((each) => each.line).join('\n')}
          </pre>
        </div>
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {pasted.map(({ line, game }, index) => (
            <li
              key={line}
              className="scene-step flex items-center gap-3 px-2 py-1"
              style={step(2 + index * 0.6)}
            >
              <Thumb game={game} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {game.title}
                <span className="sr-only"> {t('matched')}</span>
              </span>
              <CheckIcon aria-hidden="true" className="size-4 flex-none text-accent" />
            </li>
          ))}
        </ul>
      </figure>
    </Scene>
  )
}
