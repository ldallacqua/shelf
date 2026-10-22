import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SignUp } from '@/features/owner/sign-up'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignUp')
  return { title: t('metaTitle') }
}

/** Creating a shelf (ADR 004): built ahead, the same for everyone. */
export default async function SignUpPage() {
  const t = await getTranslations('SignUp')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <SignUp />
    </Page>
  )
}
