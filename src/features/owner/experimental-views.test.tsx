import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ShortcutsDialog } from '@/features/filters/shortcuts-dialog'
import { preferenceScript } from '@/features/library/preferences'
import { renderWithIntl } from '@/test/render'

import { ExperimentalViews } from './experimental-views'

/**
 * Experimental views (issue 63): the 3D shelf and the compact one stay out
 * of sight until this device turns them on, on the account page.
 */

const html = document.documentElement

describe('ExperimentalViews', () => {
  it('is off on a fresh browser, and says what it turns on and why it is apart', () => {
    new Function(preferenceScript())()
    renderWithIntl(<ExperimentalViews />)
    expect(screen.getByRole('heading', { name: 'Experimental views' })).toBeInTheDocument()
    const toggle = screen.getByRole('switch', {
      name: 'Offer the 3D shelf and the compact shelf on this device',
    })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(/Both are unfinished/)
  })

  it('turned on, is kept in this browser; turned off, sends the shelf back to 2D with covers', async () => {
    renderWithIntl(<ExperimentalViews />)
    const toggle = screen.getByRole('switch')
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(window.localStorage.getItem('shelf:experimental')).toBe('on')
    expect(html).toHaveAttribute('data-experimental', 'on')

    window.localStorage.setItem('shelf:dimension', '3d')
    html.setAttribute('data-shelf-mode', '3d')
    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(window.localStorage.getItem('shelf:experimental')).toBeNull()
    expect(window.localStorage.getItem('shelf:dimension')).toBeNull()
    expect(html).toHaveAttribute('data-shelf-mode', '2d')
  })

  it('is in Portuguese too', () => {
    renderWithIntl(<ExperimentalViews />, 'pt-BR')
    expect(screen.getByRole('heading', { name: 'Visualizações experimentais' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', {
        name: 'Oferecer a estante 3D e a estante compacta neste aparelho',
      }),
    ).toBeInTheDocument()
  })
})

describe('the keyboard shortcuts list', () => {
  it('lists D only while experimental views are on', () => {
    renderWithIntl(<ShortcutsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByText('Switch between 2D and 3D')).toBeNull()
    expect(screen.getByText('Next view')).toBeInTheDocument()
    cleanup()
    renderWithIntl(<ShortcutsDialog open onOpenChange={() => {}} experimental />)
    expect(screen.getByText('Switch between 2D and 3D')).toBeInTheDocument()
  })
})
