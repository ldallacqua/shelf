import { render, screen } from '@testing-library/react'
import { createFormatter, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import type { Locale } from '@/i18n/routing'
import { messages } from '@/test/render'

import { Terms } from './terms'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const page = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

// The page is drawn on the server: its translations, as next-intl's server functions give them.
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'Terms') =>
    createTranslator({ locale: page.locale, messages: messages[page.locale], namespace }),
  getFormatter: async () => createFormatter({ locale: page.locale, timeZone: 'UTC' }),
}))

const draw = async (locale: Locale) => {
  page.locale = locale
  render(await Terms())
}

describe('Terms', () => {
  it('says what a person can count on, from their account to what Save State can’t promise', async () => {
    await draw('en')
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Your account',
      'Your shelf',
      'Using it fairly',
      'Other services',
      'Save State for Windows',
      'Downloads',
      'Saves',
      'No promises',
      'Changes',
    ])
    expect(screen.getByText(/Save State ships no source, suggests none/)).toBeVisible()
    expect(screen.getByText(/Last changed November 8, 2026/)).toBeVisible()
  })

  it('ends with the way to what Save State keeps', async () => {
    await draw('en')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/en/privacy')
  })

  it('says so in Portuguese', async () => {
    await draw('pt-BR')
    expect(screen.getAllByRole('heading', { level: 2 }).at(0)).toHaveTextContent('Sua conta')
    expect(screen.getByText(/O Save State não traz nenhuma fonte/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Privacidade' })).toBeVisible()
  })
})
