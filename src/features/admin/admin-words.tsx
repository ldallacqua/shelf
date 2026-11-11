'use client'

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl'
import type { ReactNode } from 'react'

import en from '@messages/admin/en.json'
import ptBR from '@messages/admin/pt-BR.json'

/**
 * The admin page's words, which come with its code and not with every page: the layout hands
 * every visitor all of `messages/{locale}.json`. Only the admin page may import this.
 */
export function AdminWords({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const timeZone = useTimeZone()
  const page = useMessages()
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={{ ...page, ...(locale === 'pt-BR' ? ptBR : en) }}
    >
      {children}
    </NextIntlClientProvider>
  )
}
