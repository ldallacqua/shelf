import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { TrophiesSkeleton } from './trophies-skeleton'

/** The trophy page while it is on its way: its first screen's shapes, and words only for assistive technology. */

describe('the trophy page on its way', () => {
  it('has its heading, and says it is loading', () => {
    const { container } = renderWithIntl(<TrophiesSkeleton />, 'en')
    expect(screen.getByRole('heading', { level: 1, name: 'Trophies' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the trophies…')
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  })

  it('is drawn with the page’s own rules, its ghosts hidden from assistive technology', () => {
    const { container } = renderWithIntl(<TrophiesSkeleton />, 'pt-BR')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando os troféus…')
    for (const part of ['trophy-filters', 'trophy-nav', 'trophy-kpis', 'trophy-insights']) {
      const shape = container.querySelector(`.${part}`)
      expect(shape, part).not.toBeNull()
      expect(shape!.closest('[aria-hidden="true"]'), part).not.toBeNull()
    }
    // The games finished and four figures beside them, and six cards of what the figures say.
    expect(container.querySelectorAll('.trophy-kpi')).toHaveLength(5)
    expect(container.querySelectorAll('.trophy-insight')).toHaveLength(6)
  })
})
