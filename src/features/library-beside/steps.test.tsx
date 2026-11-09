import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { Steps } from './steps'
import { forgetAll, publishOrder } from './store'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

afterEach(forgetAll)

describe('stepping between games', () => {
  it('follows the list, replaces history, and leaves typing and dialogs alone', () => {
    const open = vi.fn()
    publishOrder({
      handle: 'sample',
      games: [
        { slug: 'ember', title: 'Ember' },
        { slug: 'tide', title: 'Tide' },
      ],
      open,
    })
    renderWithIntl(
      <>
        <Steps handle="sample" slug="ember" />
        <input aria-label="Search" />
        <div role="dialog" aria-label="Edit">
          <button>Change</button>
        </div>
      </>,
    )
    expect(screen.getByRole('button', { name: 'No game before this one' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next: Tide' }))
    expect(open).toHaveBeenLastCalledWith('tide', { replace: true })
    open.mockClear()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Change' }), { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(open).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(open).toHaveBeenCalledOnce()
  })

  it('does not offer another shelf’s order', () => {
    publishOrder({ handle: 'other', games: [{ slug: 'ember', title: 'Ember' }], open: vi.fn() })
    renderWithIntl(<Steps handle="sample" slug="ember" />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
