import { CheckIcon, MinusIcon, PlayIcon, SquareIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { RELEASES_PAGE } from '@/domain/desktop/release'
import { DownloadFacts, DownloadForWindows } from '@/features/desktop/download-windows'
import { Ledge } from '@/ui/ledge'
import { LogoMark } from '@/ui/logo'

import { DemoCase, type CaseGame, type DemoGame } from './demo-case'

/** What Shelf for Windows does, in the order a player meets it. Never its downloads (AGENTS.md). */
const POINTS = ['play', 'hours', 'saves', 'ready', 'updates'] as const

/**
 * Shelf for Windows (spec 7.7, 7.12; ADR 005, 008): a picture of its window, drawn with the room's
 * own tokens: Shelf's header as the window's bar, a game ready to play with its hours and where
 * its saves are, and the shelf under it. A picture, so it is one image to assistive technology,
 * named in words.
 */
export function DesktopDemo({ game, shelf }: { game: DemoGame; shelf: readonly CaseGame[] }) {
  const t = useTranslations('Landing.desktop')
  return (
    <div
      role="img"
      aria-label={t('window', { title: game.title, hours: game.hours })}
      className="desktop-window overflow-hidden rounded-panel border border-line-strong bg-wall"
    >
      <div className="flex h-10 items-center gap-4 border-b border-line bg-surface pl-3 text-[0.75rem]">
        <LogoMark className="size-5 text-text" />
        <span className="font-medium">{t('nav.library')}</span>
        <span className="text-muted max-sm:hidden">{t('nav.trophies')}</span>
        <span className="ml-auto rounded-full bg-accent/20 px-2.5 py-0.5 font-medium">
          {t('update')}
        </span>
        <span className="flex h-full items-stretch text-muted [&_svg]:size-3.5 [&>span]:grid [&>span]:w-10 [&>span]:place-items-center">
          <span>
            <MinusIcon />
          </span>
          <span>
            <SquareIcon />
          </span>
          <span>
            <XIcon />
          </span>
        </span>
      </div>
      <div className="desktop-game grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-5 gap-y-3 px-4 pt-5 sm:px-6">
        <DemoCase game={game} sizes="120px" className="desktop-cover" />
        <div className="grid min-w-0 content-end gap-3 pb-1">
          <p className="title text-2xl text-balance sm:text-3xl">{game.title}</p>
          <p className="text-sm text-muted">{t('where', { hours: game.hours })}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-on-accent shadow-glow">
              <PlayIcon className="size-4 fill-current" />
              {t('play')}
            </span>
            <span className="grid text-[0.75rem] leading-tight">
              <span className="readout text-[0.625rem] text-muted">{t('saves')}</span>
              {t('savesWhere')}
            </span>
          </div>
        </div>
      </div>
      <div className="desktop-shelf px-4 pt-4 sm:px-6">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/15 px-3 py-1 text-[0.75rem] font-semibold">
          <CheckIcon strokeWidth={2.5} className="size-3.5 text-accent" />
          {t('readyToPlay')}
        </span>
        <Ledge itemsClassName="flex-nowrap justify-start">
          {shelf.map((each) => (
            <DemoCase key={each.title} game={each} sizes="70px" />
          ))}
        </Ledge>
      </div>
    </div>
  )
}

/** Under the words: what the app does, a point each, and the way to download it. */
export function DesktopPoints() {
  const t = useTranslations('Landing.desktop')
  return (
    <div className="mt-6 grid gap-6">
      <ul className="grid gap-2.5">
        {POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-pretty">
            <CheckIcon
              aria-hidden="true"
              strokeWidth={2.5}
              className="mt-1 size-4 flex-none text-accent"
            />
            <span>{t(`points.${point}`)}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <DownloadForWindows variant="primary" />
          <a
            href={RELEASES_PAGE}
            className="rounded-[2px] text-sm text-muted underline decoration-1 underline-offset-4 hover:text-text hover:decoration-2"
          >
            {t('notes')}
          </a>
        </div>
        <DownloadFacts />
      </div>
    </div>
  )
}
