import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { COLLAPSED_KEY, collapsedScript } from './collapsed-script'
import { FoldBody, FoldToggle } from './fold-toggle'
import { PreferenceScript } from './preference-script'

/** Folding a shelf away (spec 3.7), remembered on this device. */

const shelf = (key = 'platform:167', name = 'PS5') => (
  <section data-shelf={key}>
    <FoldToggle shelfKey={key} name={name} controls={`${key}-games`} />
    <FoldBody shelfKey={key} id={`${key}-games`}>
      <p>{`The ${name} games`}</p>
    </FoldBody>
  </section>
)

describe('folding a shelf away', () => {
  it('hides its games, says so, and shows them again', async () => {
    renderWithIntl(shelf())
    const fold = screen.getByRole('button', { name: 'Fold the PS5 shelf away' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(fold).toHaveAttribute('aria-controls', 'platform:167-games')

    await userEvent.click(fold)
    expect(screen.queryByText('The PS5 games')).not.toBeVisible()
    const unfold = screen.getByRole('button', { name: 'Show the PS5 shelf' })
    expect(unfold).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(unfold)
    expect(screen.getByText('The PS5 games')).toBeVisible()
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBeNull()
  })

  it('is remembered on this device, shelf by shelf', async () => {
    const { unmount } = renderWithIntl(
      <>
        {shelf('platform:167', 'PS5')}
        {shelf('platform:130', 'Switch')}
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fold the Switch shelf away' }))
    expect(JSON.parse(window.localStorage.getItem(COLLAPSED_KEY)!)).toEqual(['platform:130'])
    unmount()

    renderWithIntl(
      <>
        {shelf('platform:167', 'PS5')}
        {shelf('platform:130', 'Switch')}
      </>,
    )
    expect(screen.getByText('The PS5 games')).toBeVisible()
    expect(screen.queryByText('The Switch games')).not.toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Show the Switch shelf' }))
  })
})

describe('the head script for folded shelves', () => {
  const run = () => new Function(collapsedScript())()

  it('hides folded shelves until the page comes alive, wider than a phone', () => {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['platform:130', 'status:playing']))
    run()
    const style = document.head.querySelector('style')
    expect(style?.textContent).toBe(
      '@media (min-width:40rem){' +
        'html:not([data-ready]) [data-shelf="platform:130"] [data-shelf-body]{display:none}' +
        'html:not([data-ready]) [data-shelf="status:playing"] [data-shelf-body]{display:none}}',
    )
    style?.remove()
  })

  it('runs whole as the page carries it, after the other choices of this device', () => {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['platform:130']))
    window.localStorage.setItem('shelf:experimental', 'on')
    window.localStorage.setItem('shelf:density', 'compact')
    const { container } = render(<PreferenceScript />)
    const script = container.querySelector('script')!.textContent!
    expect(() => new Function(script)()).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    expect(document.head.querySelector('style')?.textContent).toContain('platform:130')
    document.head.querySelector('style')?.remove()
  })

  it('writes nothing it was not given as a shelf, and never throws', () => {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['"]{} body{display:none', 4]))
    run()
    expect(document.head.querySelector('style')).toBeNull()
    window.localStorage.setItem(COLLAPSED_KEY, 'not json')
    expect(run).not.toThrow()
    expect(document.head.querySelector('style')).toBeNull()
  })
})
