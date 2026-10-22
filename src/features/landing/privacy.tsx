import { GlobeIcon, LockIcon, NotebookPenIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { Scene } from './scene'

/**
 * Public or private, as sign-up offers it (ADR 004): a card for each, the
 * public one picked, and the line that notes stay private either way.
 */
export function Privacy() {
  const t = useTranslations('Landing.privacy')
  const choices = [
    { key: 'public', Icon: GlobeIcon, picked: true },
    { key: 'private', Icon: LockIcon, picked: false },
  ] as const
  return (
    <Scene className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map(({ key, Icon, picked }, index) => (
          <div
            key={key}
            className={
              picked
                ? 'scene-step rounded-panel border border-accent bg-surface-raised p-5'
                : 'scene-step rounded-panel border border-line-strong bg-surface/80 p-5'
            }
            style={{ '--step': index } as CSSProperties}
          >
            <Icon aria-hidden="true" className="size-5 text-accent" />
            <p className="mt-3 title text-xl">{t(`${key}.title`)}</p>
            <p className="mt-2 text-sm text-pretty text-muted">{t(`${key}.body`)}</p>
            {key === 'public' ? (
              <p className="mt-4 rounded-control bg-surface px-3 py-2 font-mono text-xs text-text">
                {t('public.address')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <p
        className="scene-step flex items-start gap-3 rounded-panel border border-dashed border-line-strong px-5 py-4 text-sm text-pretty text-muted"
        style={{ '--step': 2 } as CSSProperties}
      >
        <NotebookPenIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-text" />
        {t('notes')}
      </p>
    </Scene>
  )
}
