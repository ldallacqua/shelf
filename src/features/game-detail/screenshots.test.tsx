import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps } from 'react'
import type VideoPlayer from './video-player'

import type { GameImage } from '@/domain/igdb/game'
import { autoplayPreference, writePreference } from '@/features/library/preferences'
import { setDevice } from '@/test/device'
import { messages, renderWithIntl } from '@/test/render'
import { Screenshots } from './screenshots'

vi.mock('./video-player', () => ({
  default: ({ playing, onPaused, onFailed }: ComponentProps<typeof VideoPlayer>) => (
    <div data-testid="player" data-playing={playing}>
      <button type="button" onClick={onPaused}>
        pause fixture
      </button>
      <button type="button" onClick={onFailed}>
        fail fixture
      </button>
    </div>
  ),
}))
let visibility: IntersectionObserverCallback
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        visibility = callback
      }
      observe() {
        visibility(
          [{ intersectionRatio: 1 } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      disconnect() {}
    },
  )
})
const visible = (ratio: number) =>
  act(() =>
    visibility(
      [{ intersectionRatio: ratio } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  )
const shots: GameImage[] = [
  { id: 'sc1', width: 1920, height: 1080 },
  { id: 'sc2', width: 1920, height: 1080, mature: true },
  { id: 'sc3', width: 1920, height: 1080 },
]
const videos = [
  { id: 'abc', name: 'Trailer' },
  { id: 'def', name: 'Trailer' },
  { id: 'ghi', name: 'Trailer' },
]
const draw = (extra = {}) =>
  renderWithIntl(<Screenshots shots={shots} videos={videos} title="A Game" {...extra} />)
const rail = () => within(screen.getByRole('list'))

describe('the selected gallery frame', () => {
  it('paints a first-party video poster, offers screenshots after two trailers and starts no player', () => {
    draw()
    expect(screen.queryByTestId('player')).toBeNull()
    const buttons = rail().getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Show Trailer · 1 from A Game')
    expect(buttons[2]).toHaveAccessibleName('Show Screenshot 1 from A Game')
    expect(buttons.at(-1)).toHaveAccessibleName('Show Trailer · 3 from A Game')
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/_next/image?'),
    )
  })
  it('selects an image in place, and opens full screen only when the large image is pressed', async () => {
    draw()
    await userEvent.click(rail().getByRole('button', { name: 'Show Screenshot 1 from A Game' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(
      screen.getByRole('button', { name: 'Screenshot 1 of 3 from A Game: open it full screen' }),
    )
    expect(within(await screen.findByRole('dialog')).getAllByRole('img')).toHaveLength(2)
  })
  it('reveals mature media explicitly and resets the reveal for another game', async () => {
    const { rerender } = draw()
    expect(rail().getAllByRole('button')[3]).toHaveAttribute('data-adult', 'hidden')
    await userEvent.click(rail().getByRole('button', { name: /blurred: show it: Screenshot 2/ }))
    expect(rail().getAllByRole('button')[3]).toHaveAttribute('data-adult', 'shown')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        <Screenshots shots={shots} videos={videos} title="Next Game" />
      </NextIntlClientProvider>,
    )
    expect(rail().getAllByRole('button')[3]).toHaveAttribute('data-adult', 'hidden')
  })
  it('plays inline after a press and recovers from failure with a usable poster', async () => {
    draw()
    await userEvent.click(
      screen.getByRole('button', { name: 'Play Trailer · 1 from A Game, muted' }),
    )
    expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
    await userEvent.click(screen.getByText('fail fixture'))
    expect(screen.getByRole('status')).toHaveTextContent('The video could not play')
    await userEvent.click(
      screen.getByRole('button', { name: 'Play Trailer · 1 from A Game, muted' }),
    )
    expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
  })

  it('also starts the initially selected video when its thumbnail is pressed', async () => {
    draw()
    await userEvent.click(rail().getByRole('button', { name: 'Show Trailer · 1 from A Game' }))
    expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
  })
  it('remembers explicit autoplay, pauses offscreen, and respects a manual pause after returning', async () => {
    draw()
    await userEvent.click(screen.getByRole('switch', { name: 'Autoplay muted videos' }))
    expect(window.localStorage.getItem('shelf:media-autoplay')).toBe('on')
    expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
    visible(0)
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'false')
    visible(1)
    await userEvent.click(screen.getByText('pause fixture'))
    visible(0)
    visible(1)
    expect(screen.getByTestId('player')).toHaveAttribute('data-playing', 'false')
  })
  it.each([{ phone: true }, { reducedMotion: true }])(
    'keeps a saved autoplay choice calm for %j',
    async (device) => {
      setDevice(device)
      writePreference(autoplayPreference, 'on')
      draw()
      expect(screen.queryByTestId('player')).toBeNull()
      await userEvent.click(
        screen.getByRole('button', { name: 'Play Trailer · 1 from A Game, muted' }),
      )
      expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
    },
  )
  it('does not autoplay a hidden adult video', () => {
    writePreference(autoplayPreference, 'on')
    draw({ adult: true })
    expect(screen.queryByTestId('player')).toBeNull()
  })

  it('withholds saved autoplay when the connection asks to save data', async () => {
    const connection = Object.assign(new EventTarget(), { saveData: true })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection })
    try {
      writePreference(autoplayPreference, 'on')
      draw()
      expect(screen.queryByTestId('player')).toBeNull()
      await userEvent.click(
        screen.getByRole('button', { name: 'Play Trailer · 1 from A Game, muted' }),
      )
      expect(await screen.findByTestId('player')).toHaveAttribute('data-playing', 'true')
    } finally {
      Reflect.deleteProperty(navigator, 'connection')
    }
  })
  it('omits an empty gallery', () => {
    const { container } = renderWithIntl(<Screenshots shots={[]} title="Empty" />)
    expect(container).toBeEmptyDOMElement()
  })
})
