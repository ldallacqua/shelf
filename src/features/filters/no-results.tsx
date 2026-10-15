import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Button } from '@/ui/button'

/**
 * No game matches (spec 3.10). The conditions stay above as chips, each
 * removable; Clear all takes them all away.
 */
export function NoResults({ onClear }: { onClear: () => void }) {
  const t = useTranslations('Filters')

  return (
    <div role="status">
      <EmptyLedge
        label={t('noResults.label')}
        title={t('noResults.title')}
        body={t('noResults.body')}
        action={
          <Button variant="primary" onClick={onClear}>
            {t('chips.clear')}
          </Button>
        }
      />
    </div>
  )
}
