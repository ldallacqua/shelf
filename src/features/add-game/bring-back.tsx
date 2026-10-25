'use client'

import { ArchiveRestoreIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { editClient } from '@/features/game-detail/edit-client'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { Button } from '@/ui/button'

type BringBackProps = {
  /** The archived game's entry. */
  entryId: string
  title: string
  variant?: 'primary' | 'secondary'
  /** After it is back: the library lands on it. */
  onBack?: () => void
}

/**
 * A game I archived, found again: brought back exactly as it was rather than
 * added a second time (spec 7.4). An IGDB record belongs to one entry per
 * library, so there is no second box to add.
 */
export function BringBack({ entryId, title, variant = 'secondary', onBack }: BringBackProps) {
  const t = useTranslations('Edit')
  const errors = useTranslations('Add')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string>()

  if (done) return <p className="text-sm text-muted">{t('broughtBack', { title })}</p>
  return (
    <span className="grid justify-items-start gap-1">
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await editClient
              .bringBack(entryId)
              .catch(() => ({ ok: false as const, reason: 'failed' as const }))
            if (!result.ok) {
              setProblem(errors(`errors.${result.reason}`))
              return
            }
            setDone(true)
            announceChange({ version: result.value.version, slug: result.value.slug, title })
            notify({ message: t('broughtBack', { title }) })
            onBack?.()
          })
        }
      >
        <ArchiveRestoreIcon aria-hidden="true" />
        {t('bringBack')}
      </Button>
      {problem ? (
        <span role="alert" className="text-sm">
          {problem}
        </span>
      ) : null}
    </span>
  )
}
