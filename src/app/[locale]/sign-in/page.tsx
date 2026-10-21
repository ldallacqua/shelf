import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { SignIn, SignInWaiting } from '@/features/owner/sign-in'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account')
  return { title: t('metaTitle') }
}

export default async function SignInPage() {
  const t = await getTranslations('Account')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      {/* The reason a sign-in came back, and where to go after one, are in the address. */}
      <Suspense fallback={<SignInWaiting />}>
        <SignIn />
      </Suspense>
    </Page>
  )
}
