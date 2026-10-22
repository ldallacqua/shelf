import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'
import { caseShapes } from '@/ui/game-case'
import { duration } from '@/ui/tokens/motion'

import { blankCases, CASE_GAP_MM, rowWidth } from './blank-cases'
import { DemoShelf } from './demo-shelf'
import { Foundations } from './foundations'
import { MotionDemo } from './motion-demo'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

describe('Foundations', () => {
  it('has one main heading and a section for each foundation', () => {
    renderWithIntl(<Foundations />)

    expect(screen.getByRole('heading', { level: 1, name: 'Foundations' })).toBeInTheDocument()
    for (const name of ['Light', 'Color', 'Type', 'Motion', 'Controls']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('says it is for reference', () => {
    renderWithIntl(<Foundations />)
    expect(screen.getByText('Design reference')).toBeInTheDocument()
  })

  it('describes each lit shelf for people who cannot see it', () => {
    renderWithIntl(<Foundations />)

    for (const name of [
      'A backlit shelf of blank game cases, facing out',
      'A shelf of blank game cases facing out, with the room lights on',
      'A shelf of blank game cases facing out, lit only by its LED bar',
    ]) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument()
    }
  })

  it('lets the keyboard change the LED color the demo shelves show', async () => {
    renderWithIntl(<Foundations />)
    const shelf = screen.getByRole('img', {
      name: 'A shelf of blank game cases facing out, lit only by its LED bar',
    })
    expect(shelf).toHaveStyle({ '--led': '#7c5cff' })

    await userEvent.click(screen.getByRole('radio', { name: 'Orange' }))

    expect(screen.getByRole('radio', { name: 'Orange' })).toBeChecked()
    expect(shelf).toHaveStyle({ '--led': '#ff7a3d' })
  })

  it('is fully translated', () => {
    renderWithIntl(<Foundations />, 'pt-BR')

    expect(screen.getByRole('heading', { level: 1, name: 'Fundamentos' })).toBeInTheDocument()
    expect(screen.getByText('Referência de design')).toBeInTheDocument()
    for (const name of ['Luz', 'Cor', 'Tipografia', 'Movimento', 'Controles']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('radiogroup', { name: 'Cor do LED' })).toBeInTheDocument()
  })
})

describe('DemoShelf', () => {
  const cases = blankCases.slice(0, 3)

  function renderShelf() {
    renderWithIntl(<DemoShelf cases={cases} led="#7c5cff" description="A demo shelf" />)
    const shelf = screen.getByRole('img', { name: 'A demo shelf' })
    const boxes = [...shelf.querySelectorAll<HTMLElement>('[data-slot="game-case"]')]
    return { shelf, boxes }
  }

  it('starts in its resting color with no case in focus', () => {
    const { shelf, boxes } = renderShelf()
    expect(boxes).toHaveLength(3)
    expect(shelf).toHaveStyle({ '--led': '#7c5cff' })
    for (const box of boxes) expect(box).not.toHaveAttribute('data-active')
  })

  it('takes the color of the case being pointed at, and lifts that case', () => {
    const { shelf, boxes } = renderShelf()

    fireEvent.pointerEnter(boxes[1] as HTMLElement)

    expect(shelf).toHaveStyle({ '--led': cases[1]?.led })
    expect(boxes[1]).toHaveAttribute('data-active', 'true')
    expect(boxes[0]).not.toHaveAttribute('data-active')
  })

  it('goes back to its resting color when the pointer leaves the shelf', () => {
    const { shelf, boxes } = renderShelf()

    fireEvent.pointerEnter(boxes[1] as HTMLElement)
    fireEvent.pointerLeave(shelf)

    expect(shelf).toHaveStyle({ '--led': '#7c5cff' })
    expect(boxes[1]).not.toHaveAttribute('data-active')
  })
})

describe('MotionDemo', () => {
  it('lists the five lengths with their milliseconds', () => {
    renderWithIntl(<MotionDemo />)

    for (const [name, value] of [
      ['Instant', duration.instant],
      ['Quick', duration.quick],
      ['Base', duration.base],
      ['Slow', duration.slow],
      ['Cinematic', duration.cinematic],
    ] as const) {
      expect(screen.getByText(name)).toBeInTheDocument()
      expect(screen.getByText(`${value} ms`)).toBeInTheDocument()
    }
  })

  it('plays, then offers to reset', async () => {
    renderWithIntl(<MotionDemo />)
    const marker = screen.getByTestId('motion-marker-slow')
    expect(marker).toHaveAttribute('data-played', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(marker).toHaveAttribute('data-played', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(marker).toHaveAttribute('data-played', 'false')
  })

  it('times each marker with its own token', () => {
    renderWithIntl(<MotionDemo />)
    expect(screen.getByTestId('motion-marker-cinematic')).toHaveStyle({
      transitionDuration: 'var(--motion-cinematic)',
    })
  })
})

describe('blank cases', () => {
  it('have no titles: they are placeholders, not cover art', () => {
    for (const item of blankCases) {
      expect(Object.keys(item).sort()).toEqual(['art', 'frame', 'id', 'led', 'shape'])
    }
  })

  it('measure the row they are laid out in', () => {
    const three = blankCases.slice(0, 3)
    const widths = three.reduce((total, item) => total + caseShapes[item.shape].width, 0)
    // Three cases, two gaps between them, and a margin at each end.
    expect(rowWidth(three)).toBe(widths + 2 * CASE_GAP_MM + 2 * 18)
    expect(rowWidth([])).toBe(2 * 18)
  })
})
