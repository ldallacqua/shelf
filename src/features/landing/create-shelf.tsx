'use client'

import { ArrowRightIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useAccount } from '@/features/owner/account'
import { libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'

/**
 * The page's one call to action: "Create your shelf", or, for someone signed
 * in, "Go to your shelf". The page is built ahead for everyone, so it arrives
 * with the first, and changes once the browser knows who is here.
 */
export function CreateShelf({ className }: { className?: string }) {
  const t = useTranslations('Landing')
  const account = useAccount()
  const mine = account.status === 'signed-in'
  return (
    <Button variant="primary" asChild className={cn('h-12 px-6 text-base', className)}>
      <Link href={mine ? libraryHref(account.handle) : '/sign-up'}>
        {mine ? t('toShelf') : t('create')}
        <ArrowRightIcon aria-hidden="true" />
      </Link>
    </Button>
  )
}
