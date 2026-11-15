'use client'

import { InfoIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { lazy, Suspense, useState } from 'react'

import { Button } from '@/ui/button'
import { Dialog, DialogContent } from '@/ui/dialog'
import { Ghosts } from '@/ui/ghosts'

// The key's own drawing comes only when it is opened: the library's script stays as it was.
const MarksList = lazy(() => import('./marks-list'))

/**
 * "What the marks mean", by the totals: a box says where a game stands by its look (spec 3.2),
 * and this says what each look means, for the shelf or the wall, whichever is shown.
 */
export function MarksKey({ view }: { view: 'shelf' | 'wall' }) {
  const t = useTranslations('Library')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-1.5 text-sm text-muted hover:text-text pointer-coarse:h-9"
        onClick={() => setOpen(true)}
      >
        <InfoIcon aria-hidden="true" />
        {t('marks.open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t('marks.title')}
          description={t('marks.description')}
          closeLabel={t('marks.close')}
          size="sm"
        >
          <Suspense fallback={<Ghosts lines={8} />}>
            <MarksList view={view} />
          </Suspense>
        </DialogContent>
      </Dialog>
    </>
  )
}
