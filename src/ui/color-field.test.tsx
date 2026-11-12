import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ColorField } from './color-field'

describe('ColorField', () => {
  it('is a color named by its label, described by its hint, and written out in words', () => {
    render(
      <ColorField
        label="Accent"
        hint="Buttons and links"
        value="#1f8fd6"
        onValueChange={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Accent')
    expect(input).toHaveAttribute('type', 'color')
    expect(input).toHaveValue('#1f8fd6')
    expect(input).toHaveAccessibleDescription('Buttons and links')
    expect(screen.getByText('#1f8fd6')).toBeInTheDocument()
  })

  it('hands on each color as it is picked', () => {
    const onValueChange = vi.fn()
    render(<ColorField label="Light" value="#000000" onValueChange={onValueChange} />)

    fireEvent.input(screen.getByLabelText('Light'), { target: { value: '#ff4fd8' } })

    expect(onValueChange).toHaveBeenCalledWith('#ff4fd8')
  })
})
