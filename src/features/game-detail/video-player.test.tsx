import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import VideoPlayer from './video-player'

/** YouTube's player takes a moment of its own: a ghost holds its place until it has come. */

describe('VideoPlayer', () => {
  it('holds the frame’s place with a ghost until it has loaded', () => {
    renderWithIntl(
      <VideoPlayer video={{ id: 'abc', name: 'Trailer' }} title="Hades" onClose={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('.ghost')).toBeInTheDocument()
    fireEvent.load(dialog.querySelector('iframe')!)
    expect(dialog.querySelector('.ghost')).not.toBeInTheDocument()
  })
})
