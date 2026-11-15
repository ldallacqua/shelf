import { useTranslations } from 'next-intl'

import { Ghost, GhostText, Loading } from '@/ui/ghost'

/** Covers drawn as ghosts while the games are read: about a large screen's first rows. */
const GHOST_COVERS = 14

/** The status chips, in Portuguese, the wider language, so their ghosts wrap where they will. */
const CHIP_GHOSTS = ['w-28', 'w-32', 'w-40']

/**
 * The duel's place while my games are read (spec 3.10): choosing, or a duel under way when this
 * device kept one, in the shapes of what replaces them. The words that don't depend on the games
 * (the headings) are drawn for real.
 */
export function DuelGhosts({ stage = 'pick' }: { stage?: 'pick' | 'fight' }) {
  const t = useTranslations('Duel')
  if (stage === 'fight') {
    return (
      <Loading label={t('loading')} className="mt-8 grid gap-6 sm:mt-10 sm:gap-8">
        <div className="grid gap-3">
          <Ghost className="h-8 w-48 sm:h-9" />
          <Ghost className="h-2 w-full rounded-full" />
        </div>
        <div className="duel-arena">
          {(['a', 'b'] as const).map((side) => (
            <div key={side} className="duel-fighter" data-side={side}>
              <span className="duel-niche">
                <Ghost className="block aspect-[2/3] w-full rounded-case" order={0} />
              </span>
              <GhostText className="w-3/4" />
              <Ghost className="h-10 w-full max-w-60 rounded-control pointer-coarse:h-11" />
            </div>
          ))}
          <div className="duel-facts grid gap-3">
            {Array.from({ length: 6 }, (_, row) => (
              <Ghost key={row} className="h-9 w-full rounded-control" order={row} />
            ))}
          </div>
        </div>
      </Loading>
    )
  }
  return (
    <div className="mt-8 grid gap-5 sm:mt-10">
      <h2 className="title text-xl sm:text-2xl">{t('pick.title')}</h2>
      <Loading
        label={t('loading')}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-10"
      >
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-2">
            <span className="mb-2 text-sm font-medium">{t('pick.from')}</span>
            <div className="flex flex-wrap gap-2">
              {CHIP_GHOSTS.map((width) => (
                <Ghost key={width} className={`h-10 rounded-full pointer-coarse:h-11 ${width}`} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
            <div className="grid min-w-0 flex-[1_1_14rem] gap-1.5">
              <span className="text-sm font-medium">{t('pick.search')}</span>
              <Ghost className="h-10 w-full rounded-control pointer-coarse:h-11" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t('pick.draw')}</span>
              <Ghost className="h-10 w-40 rounded-control pointer-coarse:h-11" />
            </div>
          </div>
          <div className="duel-pool">
            {Array.from({ length: GHOST_COVERS }, (_, index) => (
              <div key={index} className="grid gap-1.5">
                <Ghost className="block aspect-[2/3] w-full rounded-case" order={index} />
                <GhostText className="w-4/5" order={index} />
              </div>
            ))}
          </div>
        </div>
        <Ghost className="hidden h-72 rounded-panel lg:block" />
      </Loading>
    </div>
  )
}
