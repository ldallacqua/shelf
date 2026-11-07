'use client'

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl'
import type { ReactNode } from 'react'

import en from '@messages/app/en.json'
import ptBR from '@messages/app/pt-BR.json'

/**
 * The words only Shelf for Windows draws, which come with the code that draws them and not with the
 * page: the layout hands every visitor all of `messages/{locale}.json` (ADR 007, decision 4). Only
 * code the app alone fetches may import this. The page's own words stay reachable inside, for the
 * parts the app's sections share with the site's, such as whose a setting is.
 */
export function AppWords({ children }: { children: ReactNode }) {
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
