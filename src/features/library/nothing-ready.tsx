import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Button } from '@/ui/button'

/** Ready to play leaves no game (spec 7.7): it says why, and offers every game. */
export function NothingReady({ onShowAll }: { onShowAll: () => void }) {
  const t = useTranslations('Library.ready.none')

  return (
    <div role="status">
      <EmptyLedge
        label={t('label')}
        title={t('title')}
        body={t('body')}
        action={
          <Button variant="primary" onClick={onShowAll}>
            {t('showAll')}
          </Button>
        }
      />
    </div>
  )
}
