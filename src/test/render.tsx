import { render, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { Locale } from '@/i18n/routing'
import adminEn from '@messages/admin/en.json'
import adminPtBR from '@messages/admin/pt-BR.json'
import appEn from '@messages/app/en.json'
import appPtBR from '@messages/app/pt-BR.json'
import en from '@messages/en.json'
import ptBR from '@messages/pt-BR.json'

export const messages = {
  en: { ...en, ...appEn, ...adminEn },
  'pt-BR': { ...ptBR, ...appPtBR, ...adminPtBR },
} satisfies Record<Locale, typeof en & typeof appEn & typeof adminEn>

/** Renders a component with the real translations for one language. */
export function renderWithIntl(ui: ReactElement, locale: Locale = 'en'): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  )
}
