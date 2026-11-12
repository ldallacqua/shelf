import {
  BotIcon,
  CopyIcon,
  LayoutGridIcon,
  MonitorDownIcon,
  PaletteIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  TrophyIcon,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Eyebrow, Page } from '@/features/shell/page'

/** Each tile, and the part of the page it leads to. */
const TILES = [
  { key: 'filters', part: 'how', icon: ScanSearchIcon },
  { key: 'copies', part: 'copies', icon: CopyIcon },
  { key: 'sync', part: 'sync', icon: RefreshCwIcon },
  { key: 'views', part: 'views', icon: LayoutGridIcon },
  { key: 'look', part: 'look', icon: PaletteIcon },
  { key: 'desktop', part: 'desktop', icon: MonitorDownIcon },
  { key: 'progress', part: 'finished', icon: TrophyIcon },
  { key: 'assistant', part: 'assistant', icon: BotIcon },
] as const satisfies readonly { key: string; part: string; icon: LucideIcon }[]

/** The parts the overview leads to, for the test that holds each to a part on the page. */
export const overviewParts: readonly string[] = TILES.map((tile) => tile.part)

/**
 * Everything Shelf does, at a glance, right under the first screen: a tile for each part below,
 * each a link to it. For a visitor who came for one thing, and for one deciding whether to read
 * on. Drawn on the server, with no script: the links are the page's own.
 */
export function Overview() {
  const t = useTranslations('Landing.features')
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="landing-part scroll-mt-16 py-16 sm:py-20"
    >
      <Page>
        <div className="reveal max-w-2xl">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 id="features-title" className="mt-3 title text-3xl text-balance sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-lg text-pretty text-muted">{t('body')}</p>
        </div>
        <ul className="reveal mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map(({ key, part, icon: Icon }) => (
            <li key={key} className="flex">
              <a
                href={`#${part}`}
                className="group grid w-full content-start gap-3 rounded-panel border border-line bg-surface p-5 transition-[border-color,background-color] duration-quick ease-settle hover:border-line-strong hover:bg-surface-raised"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 place-items-center rounded-control bg-accent/15 text-text transition-shadow duration-quick ease-settle group-hover:shadow-glow [&_svg]:size-5"
                >
                  <Icon />
                </span>
                <span className="title text-lg">{t(`${key}.title`)}</span>
                <span className="text-sm text-pretty text-muted">{t(`${key}.body`)}</span>
              </a>
            </li>
          ))}
        </ul>
      </Page>
    </section>
  )
}
