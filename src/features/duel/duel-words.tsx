'use client'

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl'
import type { ReactNode } from 'react'

import en from '@messages/duel/en.json'
import ptBR from '@messages/duel/pt-BR.json'

/**
 * The duel's words (spec 3.14), which come with its code and not with every page: the layout hands
 * every visitor all of `messages/{locale}.json`. Only the duel's page and its stories import this.
 */
export function DuelWords({ children }: { children: ReactNode }) {
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
