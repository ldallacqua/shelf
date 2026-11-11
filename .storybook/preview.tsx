import type { Decorator, Preview } from '@storybook/nextjs-vite'
import { NextIntlClientProvider } from 'next-intl'
import { useEffect, type ReactNode } from 'react'

import adminEn from '../messages/admin/en.json'
import adminPtBR from '../messages/admin/pt-BR.json'
import appEn from '../messages/app/en.json'
import appPtBR from '../messages/app/pt-BR.json'
import en from '../messages/en.json'
import ptBR from '../messages/pt-BR.json'
import { presetNames } from '../src/domain/colorway/names'
import { fontVariables } from '../src/ui/fonts'

import '../src/app/globals.css'

const messages = {
  en: { ...en, ...appEn, ...adminEn },
  'pt-BR': { ...ptBR, ...appPtBR, ...adminPtBR },
} as const
type Locale = keyof typeof messages

/**
 * Lights the story the way the app would be lit: `data-theme` and `data-colors`
 * on <html>, the attributes the theme script sets. The toolbar's theme and
 * colors switches drive them.
 */
function Lit({
  theme,
  colors,
  children,
}: {
  theme: 'light' | 'dark'
  colors: string
  children: ReactNode
}) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.themeChoice = theme
    if (colors === 'violet') delete root.dataset.colors
    else root.dataset.colors = colors
    root.classList.add(...fontVariables.split(' '))
  }, [theme, colors])

  return children
}

/** Gives the story real translations. The toolbar's language switch picks which. */
function Translated({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  )
}

const withTheme: Decorator = (Story, context) => (
  <Lit
    theme={context.globals.theme === 'dark' ? 'dark' : 'light'}
    colors={presetNames.find((name) => name === context.globals.colors) ?? 'violet'}
  >
    <Story />
  </Lit>
)

const withLanguage: Decorator = (Story, context) => (
  <Translated locale={context.globals.locale === 'pt-BR' ? 'pt-BR' : 'en'}>
    <Story />
  </Translated>
)

const preview: Preview = {
  decorators: [withLanguage, withTheme],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Lights on', icon: 'sun' },
          { value: 'dark', title: 'Lights off', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    colors: {
      description: 'Colors',
      toolbar: {
        title: 'Colors',
        icon: 'paintbrush',
        items: presetNames.map((name) => ({ value: name, title: name })),
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'pt-BR', title: 'Português (Brasil)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark', colors: 'violet', locale: 'en' },
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true },
    // Accessibility findings fail the story instead of only being listed.
    a11y: { test: 'error' },
    // The page's own wall is the background.
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
}

export default preview
