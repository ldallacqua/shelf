import { render, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { Locale } from '@/i18n/routing'
import en from '@messages/en.json'
import ptBR from '@messages/pt-BR.json'

export const messages = { en, 'pt-BR': ptBR } satisfies Record<Locale, typeof en>

/** Renders a component with the real translations for one language. */
export function renderWithIntl(ui: ReactElement, locale: Locale = 'en'): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  )
}
