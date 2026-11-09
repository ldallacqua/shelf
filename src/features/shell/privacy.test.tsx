import { render, screen } from '@testing-library/react'
import { createFormatter, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import type { Locale } from '@/i18n/routing'
import { messages } from '@/test/render'

import { Privacy } from './privacy'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const page = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

// The page is drawn on the server: its translations, as next-intl's server functions give them.
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'Privacy') =>
    createTranslator({ locale: page.locale, messages: messages[page.locale], namespace }),
  getFormatter: async () => createFormatter({ locale: page.locale, timeZone: 'UTC' }),
}))

const draw = async (locale: Locale) => {
  page.locale = locale
  render(await Privacy())
}

describe('Privacy', () => {
  it('ends by saying whose names the stores and consoles are, and that Shelf is none of theirs', async () => {
    await draw('en')
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.at(-1)).toHaveTextContent('Trademarks')
    // Valve's own words, as it asks beside its sign-in button.
    expect(
      screen.getByText(
        /Steam and the Steam logo are trademarks and\/or registered trademarks of Valve Corporation/,
      ),
    ).toHaveTextContent(/is not affiliated with, endorsed or sponsored by any of them/)
  })

  it('says what Shelf for Windows does with saves, and with what Google gives it, as Google asks', async () => {
    await draw('en')
    const saves = screen.getByRole('heading', {
      name: 'Saves, in Shelf for Windows',
    }).parentElement!
    expect(saves).toHaveTextContent('Shelf’s server never receives a save')
    expect(saves).toHaveTextContent('only the files Shelf itself made')
    expect(saves).toHaveTextContent(
      'adheres to the Google API Services User Data Policy, including the Limited Use requirements',
    )
    expect(screen.getByRole('heading', { name: 'Downloads, in Shelf for Windows' })).toBeVisible()
  })

  it('says so in Portuguese, with Valve’s Portuguese words', async () => {
    await draw('pt-BR')
    expect(screen.getAllByRole('heading', { level: 2 }).at(-1)).toHaveTextContent('Marcas')
    expect(
      screen.getByText(/Steam e o logotipo Steam são marcas e\/ou marcas registradas/),
    ).toHaveTextContent(/não tem ligação com nenhuma dessas empresas/)
  })
})
