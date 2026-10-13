import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Filters</Button>)
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute('type', 'button')
  })

  it('can submit when asked to', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
  })

  it('lends its look to a link without turning it into a button', () => {
    render(
      <Button asChild variant="primary">
        <a href="https://www.igdb.com">IGDB.com</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'IGDB.com' })
    expect(link).toHaveAttribute('href', 'https://www.igdb.com')
    expect(link).not.toHaveAttribute('type')
    expect(link).toHaveAttribute('data-slot', 'button')
  })

  it('cannot be used while disabled', () => {
    render(<Button disabled>Not available</Button>)
    expect(screen.getByRole('button', { name: 'Not available' })).toBeDisabled()
  })
})
