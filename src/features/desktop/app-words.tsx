'use client'

import { NextIntlClientProvider, useLocale, useTimeZone } from 'next-intl'
import type { ReactNode } from 'react'

import en from '@messages/app/en.json'
import ptBR from '@messages/app/pt-BR.json'

/**
 * The words only Shelf for Windows draws, which come with the code that draws them and not with the
 * page: the layout hands every visitor all of `messages/{locale}.json` (ADR 007, decision 4). Only
 * code the app alone fetches may import this.
 */
export function AppWords({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const timeZone = useTimeZone()
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={locale === 'pt-BR' ? ptBR : en}
    >
      {children}
    </NextIntlClientProvider>
  )
}
