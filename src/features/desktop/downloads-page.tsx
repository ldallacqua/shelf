'use client'

import { SettingsIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { AppWords } from './app-words'
import { Downloads } from './downloads-list'

function Words() {
  const t = useTranslations('Downloads')
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-10 sm:pt-14">
        <h1 className="title text-3xl sm:text-5xl">{t('title')}</h1>
        <Button asChild size="sm" variant="ghost">
          <Link href="/account/settings">
            <SettingsIcon aria-hidden="true" />
            {t('toSettings')}
          </Link>
        </Button>
      </div>
      <div className="mt-8">
        <Downloads />
      </div>
    </>
  )
}

/** Everything being downloaded on this computer, on a page of its own (ADR 007, spec 7.10). */
export default function DownloadsPage() {
  return (
    <AppWords>
      <Words />
    </AppWords>
  )
}
