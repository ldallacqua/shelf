import { useTranslations } from 'next-intl'
import { Fragment, type ReactNode } from 'react'

import { steamFileUrl } from '@/domain/igdb/images'
import {
  foldDescription,
  hasWords,
  type Description,
  type DescriptionBlock,
  type Run,
} from '@/domain/steam/description'
import { cn } from '@/ui/cn'

import { AdultPictures, DescriptionMedia } from './description-media'

/** About this much of a passage is shown before "Read more". */
export const SHOWN_CHARS = 420
/** Less than this left over is shown too: hiding a sliver is worse than showing it. */
export const HIDDEN_CHARS = 200

/**
 * The rest of a long passage behind "Read more", opened in place, with no script: a closed
 * `details` is still found by the browser's search.
 */
export function ReadMore({
  children,
  className,
  lang,
}: {
  children: ReactNode
  className?: string
  /** The page's language, for the button, where the passage is in another. */
  lang?: string
}) {
  const t = useTranslations('Game')
  return (
    <details className="game-more">
      <summary lang={lang}>
        <span className="game-more-closed">{t('readMore')}</span>
        <span className="game-more-open">{t('readLess')}</span>
      </summary>
      <div className={cn('game-prose', className)}>{children}</div>
    </details>
  )
}

function Runs({ runs }: { runs: readonly Run[] }) {
  return runs.map((run, index) => {
    let words: ReactNode = run.text
    if (run.strike) words = <s>{words}</s>
    if (run.underline) words = <u>{words}</u>
    if (run.em) words = <em>{words}</em>
    if (run.strong) words = <strong>{words}</strong>
    return <Fragment key={index}>{words}</Fragment>
  })
}

function Block({ block, title }: { block: DescriptionBlock; title: string }) {
  switch (block.kind) {
    case 'heading':
      return <h3>{block.text}</h3>
    case 'paragraph':
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      )
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index}>
              <Runs runs={item} />
            </li>
          ))}
        </List>
      )
    }
    case 'picture':
      // A plain picture needs no script; a clip or a picture for adults does.
      return block.loop || block.mature ? (
        <DescriptionMedia picture={block} title={title} />
      ) : (
        <div className="game-picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={steamFileUrl(block.id)}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
      )
  }
}

/**
 * A game's long description from its store page on Steam (ADR 010, decision 11; spec 7.1): its
 * headings, paragraphs, lists and pictures, drawn by Shelf from the blocks it was read into. A long
 * one shows its first paragraph and about a screen's worth, and the rest behind "Read more".
 * The pictures have no words to give: they are left out of what a screen reader says, and a
 * description that is only pictures is led by the summary, which has.
 */
export function GameDescription({
  blocks: read,
  summary,
  title,
  slug,
  lang,
  textLang,
}: {
  blocks: Description
  /** The store's short description, or IGDB's summary: words for a description that has none. */
  summary?: string
  title: string
  slug: string
  /** The page's language, for the button. */
  lang: string
  /** The description's own, when it is not the page's: the store's English. */
  textLang?: string
}) {
  const lead = (text: string): Description =>
    text.split(/\n+/).flatMap((line) => {
      const words = line.trim()
      return words ? [{ kind: 'paragraph' as const, runs: [{ text: words }] }] : []
    })
  const blocks = summary && !hasWords(read) ? [...lead(summary), ...read] : read
  const { first, rest } = foldDescription(blocks, SHOWN_CHARS, HIDDEN_CHARS)
  const all = (list: Description) =>
    list.map((block, index) => <Block key={index} block={block} title={title} />)
  const drawn = (
    <div className="game-prose game-description" lang={textLang}>
      {all(first)}
      {rest.length > 0 ? (
        <ReadMore className="game-description" lang={lang}>
          {all(rest)}
        </ReadMore>
      ) : null}
    </div>
  )
  return blocks.some((block) => block.kind === 'picture' && block.mature) ? (
    <AdultPictures game={slug}>{drawn}</AdultPictures>
  ) : (
    drawn
  )
}
