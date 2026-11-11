import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

import { messages, renderWithIntl } from '@/test/render'
import VideoPlayer from './video-player'
import { isGalleryPlaying } from './media-focus'
import type { YoutubeOptions, YoutubePlayer } from './youtube'

const api = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  mute: vi.fn(),
  destroy: vi.fn(),
  options: undefined as YoutubeOptions | undefined,
  target: undefined as YoutubePlayer | undefined,
}))
vi.mock('./youtube', () => ({
  loadYoutube: async () => ({
    Player: class {
      constructor(slot: HTMLElement, options: YoutubeOptions) {
        api.options = options
        const iframe = document.createElement('iframe')
        slot.replaceWith(iframe)
        api.target = {
          playVideo: api.play,
          pauseVideo: api.pause,
          mute: api.mute,
          destroy: api.destroy,
          getIframe: () => iframe,
        }
        return api.target
      }
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  api.options = undefined
})
const props = () => ({
  video: { id: 'abc', name: 'Trailer' },
  title: 'Hades',
  playing: true,
  visible: true,
  onPaused: vi.fn(),
  onPlaying: vi.fn(),
  onFailed: vi.fn(),
})
const ready = async () => {
  await waitFor(() => expect(api.options).toBeDefined())
  act(() => api.options!.events.onReady({ target: api.target! }))
}

describe('inline video playback', () => {
  it('holds a skeleton until ready, starts muted and leaves controls to the player', async () => {
    const { container } = renderWithIntl(<VideoPlayer {...props()} />)
    expect(container.querySelector('.ghost')).toBeInTheDocument()
    await ready()
    expect(container.querySelector('.ghost')).toBeNull()
    expect(api.mute).toHaveBeenCalled()
    expect(api.play).toHaveBeenCalled()
    expect(screen.getByTitle('Trailer: Hades')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('pauses out of view, distinguishes a manual pause and destroys playback when hidden by navigation', async () => {
    const values = props()
    const { rerender, unmount } = renderWithIntl(<VideoPlayer {...values} />)
    await ready()
    act(() => api.options!.events.onStateChange({ data: 1 }))
    expect(isGalleryPlaying()).toBe(true)
    rerender(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        <VideoPlayer {...values} playing={false} visible={false} />
      </NextIntlClientProvider>,
    )
    expect(api.pause).toHaveBeenCalled()
    act(() => api.options!.events.onStateChange({ data: 1 }))
    expect(isGalleryPlaying()).toBe(false)
    act(() => api.options!.events.onStateChange({ data: 2 }))
    expect(values.onPaused).not.toHaveBeenCalled()
    act(() => api.options!.events.onStateChange({ data: 2 }))
    expect(values.onPaused).toHaveBeenCalledOnce()
    unmount()
    expect(api.destroy).toHaveBeenCalled()
    expect(isGalleryPlaying()).toBe(false)
  })
  it('reports an unavailable or blocked video so its poster can offer a retry', async () => {
    const values = props()
    renderWithIntl(<VideoPlayer {...values} />)
    await ready()
    act(() => api.options!.events.onAutoplayBlocked())
    expect(values.onFailed).toHaveBeenCalledOnce()
  })
})
