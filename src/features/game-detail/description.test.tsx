import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { GameFacts } from '@/domain/library/game-page'
import type { LibraryGame } from '@/domain/library/library'
import { testGame } from '@/domain/library/testing'
import type { DescriptionBlock, DescriptionPicture } from '@/domain/steam/description'
import { setDevice } from '@/test/device'
import { renderWithIntl } from '@/test/render'

import { GameDetail } from './game-detail'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

/** A game's long description from its store page on Steam, under About (ADR 010, decision 11). */

const FILES = 'steam/apps/400/extras'
const STEAM = 'https://shared.akamai.steamstatic.com/store_item_assets'

const game: LibraryGame = testGame('Tidewater')

const facts = (extra: Partial<GameFacts> = {}): GameFacts => ({
  slug: game.slug,
  summary: 'A keeper and a lighthouse.',
  storyline: 'The light went out in spring.',
  screenshots: [],
  releases: [],
  names: {
    genre: [],
    theme: [],
    mode: [],
    perspective: [],
    franchise: [],
    series: [],
    company: [],
    platform: [],
  },
  ...extra,
})

const draw = (extra: Partial<GameFacts>) =>
  renderWithIntl(
    <GameDetail handle="sample" game={game} tags={[]} platforms={new Map()} facts={facts(extra)} />,
  )

const about = () => screen.getByRole('heading', { name: 'About' }).closest('section')!

const clip = (extra: Partial<DescriptionPicture> = {}): DescriptionBlock => ({
  kind: 'picture',
  id: `${FILES}/c.poster.avif`,
  width: 600,
  height: 338,
  loop: { mp4: `${FILES}/c.mp4`, webm: `${FILES}/c.webm` },
  ...extra,
})

/** Clips in view at once, as the window would see them. */
class InView {
  readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  disconnect() {}
  unobserve() {}
}

let play: MockInstance<HTMLMediaElement['play']>
let pause: MockInstance<HTMLMediaElement['pause']>

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', InView)
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

afterEach(() => {
  setDevice({ reducedMotion: false })
  vi.restoreAllMocks()
})

describe('a store description', () => {
  it('is what About shows, in place of IGDB’s summary and story', () => {
    draw({
      description: [
        { kind: 'heading', text: 'STORY' },
        {
          kind: 'paragraph',
          runs: [{ text: 'A keeper', strong: true }, { text: ' tends the light.' }],
        },
        { kind: 'list', items: [[{ text: 'Forty islands' }], [{ text: 'Six seasons' }]] },
        { kind: 'picture', id: `${FILES}/a.avif`, width: 616, height: 924 },
      ],
    })
    const section = within(about())
    expect(section.getByRole('heading', { name: 'STORY', level: 3 })).toBeInTheDocument()
    expect(section.getByText('A keeper').tagName).toBe('STRONG')
    expect(section.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Forty islands',
      'Six seasons',
    ])
    // A picture has no words to give a screen reader, and comes from Steam's servers only.
    const picture = about().querySelector('img')!
    expect(picture).toHaveAttribute('alt', '')
    expect(picture).toHaveAttribute('src', `${STEAM}/${FILES}/a.avif`)
    expect(picture).toHaveAttribute('loading', 'lazy')
    expect(section.queryByText('A keeper and a lighthouse.')).not.toBeInTheDocument()
    expect(section.queryByText('The light went out in spring.')).not.toBeInTheDocument()
  })

  it('leaves About to IGDB’s words for a game without one', () => {
    draw({})
    const section = within(about())
    expect(screen.getByText('A keeper and a lighthouse.').closest('header')).not.toBeNull()
    expect(section.getByText('The light went out in spring.')).toBeInTheDocument()
  })

  it('keeps the rest of a long one behind Read more, and its pictures with it', () => {
    const words = (text: string) => ({ kind: 'paragraph' as const, runs: [{ text }] })
    draw({
      description: [
        words(`First. ${'Words. '.repeat(70)}`),
        { kind: 'heading', text: 'LATER' },
        words('Second.'),
        { kind: 'picture', id: `${FILES}/b.avif`, width: 616, height: 300 },
      ],
    })
    const more = within(about()).getByText('Read more').closest('details')!
    expect(more).not.toHaveAttribute('open')
    expect(more).toHaveTextContent('LATER')
    expect(more).not.toHaveTextContent('First.')
    expect(more.querySelector('img')).not.toBeNull()
  })

  it('is led by the summary when it is only pictures with their words drawn in', () => {
    draw({ description: [{ kind: 'picture', id: `${FILES}/a.avif`, width: 780, height: 300 }] })
    const section = within(about())
    expect(section.queryByText('A keeper and a lighthouse.')).toBeNull()
    expect(screen.getByText('A keeper and a lighthouse.').closest('header')).not.toBeNull()
    expect(about().querySelector('img')).not.toBeNull()
  })

  it('plays a clip in view, and pauses it when pressed (WCAG 2.2.2)', async () => {
    draw({ description: [clip()] })
    const button = within(about()).getByRole('button', {
      name: 'An animation from Tidewater’s description, playing: pause it',
    })
    const video = about().querySelector('video')!
    expect(video.muted).toBe(true)
    // The VP9 WebM before Steam's HEVC MP4, which Edge and WebView2 take and cannot decode.
    const sources = [...video.querySelectorAll('source')]
    expect(sources.map((source) => [source.getAttribute('src'), source.type])).toEqual([
      [`${STEAM}/${FILES}/c.webm`, 'video/webm; codecs=vp9'],
      [`${STEAM}/${FILES}/c.mp4`, 'video/mp4'],
    ])
    expect(play).toHaveBeenCalled()
    // Its still stands under it until the clip's first frame.
    expect(about().querySelector('img')).toHaveAttribute('src', `${STEAM}/${FILES}/c.poster.avif`)

    fireEvent.playing(video)
    await userEvent.click(button)
    // Paused where it is: the clip stays, at its frame.
    expect(about().querySelector('video')).toBe(video)
    expect(pause).toHaveBeenCalled()
    expect(button).toHaveAccessibleName(
      'An animation from Tidewater’s description, paused: play it',
    )
  })

  it('stands still under reduced motion, and loads nothing, until pressed', async () => {
    setDevice({ reducedMotion: true })
    draw({ description: [clip()] })
    expect(about().querySelector('video')).toBeNull()
    expect(play).not.toHaveBeenCalled()

    await userEvent.click(
      within(about()).getByRole('button', {
        name: 'An animation from Tidewater’s description, paused: play it',
      }),
    )
    expect(about().querySelector('video')).not.toBeNull()
    expect(play).toHaveBeenCalled()
  })

  it('blurs the pictures of a game for adults until asked, then shows them all', async () => {
    draw({
      description: [
        { kind: 'paragraph', runs: [{ text: 'Words.' }] },
        { kind: 'picture', id: `${FILES}/a.jpg`, mature: true },
        clip({ mature: true }),
      ],
    })
    const hidden = within(about()).getAllByRole('button', {
      name: 'A picture from Tidewater’s description, for adults, blurred: show its pictures for adults',
    })
    expect(hidden).toHaveLength(2)
    expect(about().querySelector('video')).toBeNull()
    expect(play).not.toHaveBeenCalled()

    await act(() => userEvent.click(hidden[0]!))
    expect(about().querySelectorAll('[data-adult="hidden"]')).toHaveLength(0)
    expect(about().querySelectorAll('[data-adult="shown"]')).toHaveLength(2)
    expect(
      within(about()).getByRole('button', {
        name: 'An animation from Tidewater’s description, playing: pause it',
      }),
    ).toBeInTheDocument()
  })
})
