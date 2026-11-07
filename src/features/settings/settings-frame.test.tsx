import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setBridgeForTests } from '@/features/desktop/tauri'
import { renderWithIntl } from '@/test/render'

import { SettingsHub, SettingsNav } from './settings-frame'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** Settings' two lists of pages (issue 152). */

afterEach(() => setBridgeForTests(undefined))

describe('the side list', () => {
  it('groups the pages by whose they are, and marks the current one', () => {
    setBridgeForTests(null)
    renderWithIntl(<SettingsNav current="privacy" />)
    const nav = screen.getByRole('navigation', { name: 'Settings' })
    expect(within(nav).getByRole('link', { name: 'Privacy & content' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByText('Account')).toBeInTheDocument()
    expect(within(nav).getByText('This device')).toBeInTheDocument()
  })

  it('in a browser, lists nothing of Shelf for Windows, and holds no place for it', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(<SettingsNav current="profile" />)
    expect(screen.queryByText('Shelf for Windows')).not.toBeInTheDocument()
    expect(container.querySelector('.ghost')).toBeNull()
  })

  it('in the app, lists its pages with its own words', async () => {
    setBridgeForTests(vi.fn())
    renderWithIntl(<SettingsNav current="download-services" />, 'pt-BR')
    expect(await screen.findByText('Shelf para Windows')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Serviços de download' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('the list of every page', () => {
  it('says what each page holds, and leads to it', () => {
    setBridgeForTests(null)
    renderWithIntl(<SettingsHub />)
    const account = screen.getByRole('region', { name: 'Account' })
    expect(within(account).getByRole('link', { name: /Security/ })).toHaveAttribute(
      'href',
      '/en/settings/security',
    )
    expect(screen.getByRole('link', { name: /Appearance/ })).toHaveTextContent(
      'Theme, language and experimental views',
    )
  })
})
