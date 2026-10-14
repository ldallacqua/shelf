import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { thumbHashToDataURL } from 'thumbhash'
import { createTranslator } from 'next-intl'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import {
  caseShapes as domainShapes,
  plastics as domainPlastics,
} from '@/domain/platforms/platforms'
import { messages, renderWithIntl } from '@/test/render'
import { caseShapes, plastics } from '@/ui/game-case'

import { Cover } from './cover'
import { describeBox, shelfName } from './describe'
import { EmptyLibrary } from './empty-library'
import { dateOf, hoursOf, outOfTen } from './format'
import { GameBox, platformFor, platformsOwned } from './game-box'
import { GamePreview } from './game-preview'
import { markPageLive, pageIsLive, resetPageLive } from './live'
import { resetPreviews } from './preview-queue'
import {
  densityPreference,
  preferenceScript,
  readPreference,
  wallSizePreference,
  writePreference,
} from './preferences'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'

const ps5: LibraryPlatform = {
  id: 167,
  key: 'ps5',
  name: 'PlayStation 5',
  short: 'PS5',
  family: 'playstation',
  generation: 9,
  shape: 'bluRay',
  plastic: 'blue',
}
const pc: LibraryPlatform = {
  id: 6,
  key: 'pc',
  name: 'PC',
  short: 'PC',
  family: 'pc',
  shape: 'keepCase',
  plastic: 'black',
}
const platforms = new Map([ps5, pc].map((platform) => [platform.id, platform]))

const game = (extra: Partial<LibraryGame> = {}): LibraryGame => ({
  slug: 'hades',
  title: 'Hades',
  status: 'backlog',
  addedOn: '2024-03-05',
  minutes: 0,
  igdbRatingCount: 0,
  kind: 'main',
  year: 2020,
  cover: 'co39vc',
  colors: ['#c8402a', '#f2c14e', '#1b1011'],
  featured: false,
  hasNotes: false,
  copies: [{ platform: 167, format: 'physical' }],
  genres: [],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [167, 6],
  franchises: [],
  series: [],
  developers: [],
  publishers: [],
  tags: [],
  ...extra,
})

const item = (extra: Partial<LibraryGame> = {}): ShelfItem => {
  const entry = game(extra)
  const [copy] = entry.copies
  return copy ? { game: entry, copy } : { game: entry }
}

const t = createTranslator({ locale: 'en', messages: messages.en, namespace: 'Library' })
const tPt = createTranslator({ locale: 'pt-BR', messages: messages['pt-BR'], namespace: 'Library' })

const box = (entry: ShelfItem, density: 'covers' | 'compact' = 'covers', onOpen = vi.fn()) => {
  const platform = platformFor(entry, platforms)
  renderWithIntl(
    <GameBox
      item={entry}
      platform={platform}
      density={density}
      label={describeBox(entry, platform, t)}
      active={false}
      tabbable
      index={0}
      onOpen={onOpen}
    />,
  )
  return screen.getByRole('button')
}

describe('describeBox: a box in words', () => {
  it('names the title, the platform, the format and the status', () => {
    expect(describeBox(item(), ps5, t)).toBe('Hades (2020), PS5, Physical, Backlog')
  })

  it('says when a game is not owned', () => {
    const wished = item({ status: 'wishlist', copies: [] })
    expect(describeBox(wished, undefined, t)).toBe('Hades (2020), not owned, Wishlist')
  })

  it('says how many platforms a game is owned on, past one', () => {
    const twice = item({
      copies: [
        { platform: 167, format: 'physical' },
        { platform: 6, format: 'digital' },
      ],
    })
    expect(describeBox(twice, ps5, t)).toBe(
      'Hades (2020), PS5, Physical, Backlog, owned on 2 platforms',
    )
    expect(platformsOwned(twice)).toBe(2)
  })

  it('leaves the year out when there is none', () => {
    expect(describeBox(item({ year: undefined }), ps5, t)).toBe('Hades, PS5, Physical, Backlog')
  })

  it('is translated, except the title and the platform', () => {
    expect(describeBox(item({ status: 'completed' }), ps5, tPt)).toBe(
      'Hades (2020), PS5, Físico, Zerado',
    )
  })
})

describe('shelfName', () => {
  it('names each kind of shelf', () => {
    expect(shelfName({ kind: 'platform', key: 'platform:167', platform: ps5, items: [] }, t)).toBe(
      'PlayStation 5',
    )
    expect(
      shelfName({ kind: 'platform', key: 'platform:167', platform: ps5, items: [] }, t, true),
    ).toBe('PS5')
    expect(shelfName({ kind: 'not-owned', key: 'platform:none', items: [] }, t)).toBe('Not owned')
    expect(
      shelfName({ kind: 'status', key: 'status:dropped', status: 'dropped', items: [] }, tPt),
    ).toBe('Abandonado')
    expect(shelfName({ kind: 'year', key: 'year:2018', year: 2018, items: [] }, t)).toBe('2018')
    expect(shelfName({ kind: 'all', key: 'all', items: [] }, t)).toBe('All games')
  })
})

describe('GameBox (spec 3.2: state is never shown by color alone)', () => {
  it('is a button named in full, with the cover’s title as the image’s text', () => {
    const button = box(item())
    expect(button).toHaveAccessibleName('Hades (2020), PS5, Physical, Backlog')
    expect(within(button).getByRole('img', { name: 'Hades' })).toHaveAttribute(
      'src',
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.webp',
    )
    expect(button).toHaveAttribute('data-status', 'backlog')
  })

  it('stands in its platform’s case: the shape and the plastic', () => {
    const view = box(item()).querySelector('.game-case') as HTMLElement
    expect(view.style.width).toBe(`calc(var(--mm) * ${caseShapes.bluRay.width})`)
    expect(view.style.getPropertyValue('--case-frame')).toBe('var(--plastic-blue)')
  })

  it('wears a foil seal when completed', () => {
    expect(box(item({ status: 'completed' })).querySelector('.game-seal')).not.toBeNull()
  })

  it('has no seal otherwise', () => {
    expect(box(item()).querySelector('.game-seal')).toBeNull()
  })

  it('shows a live light when playing', () => {
    expect(box(item({ status: 'playing' })).querySelector('.game-live')).not.toBeNull()
  })

  it('shows a count when owned on more than one platform', () => {
    const twice = item({
      copies: [
        { platform: 167, format: 'physical' },
        { platform: 6, format: 'digital' },
      ],
    })
    expect(box(twice).querySelector('.game-count')).toHaveTextContent('2')
  })

  it('is a cover with no case around it when owned as a download', () => {
    const button = box(item({ copies: [{ platform: 167, format: 'digital' }] }))
    expect(button.querySelector('.game-loose')).not.toBeNull()
    expect(button.querySelector('.game-case')).toBeNull()
  })

  it('keeps its case outline on the wishlist', () => {
    const button = box(item({ status: 'wishlist', copies: [] }))
    expect(button).toHaveAttribute('data-status', 'wishlist')
    // With no copy, the case is the first platform the game came out on.
    expect(button.querySelector('.game-case')).not.toBeNull()
  })

  it('shows its title as text on a spine in the compact shelf', () => {
    const button = box(item(), 'compact')
    expect(button.querySelector('.game-spine-title')).toHaveTextContent('Hades')
    expect(button).toHaveAccessibleName('Hades (2020), PS5, Physical, Backlog')
  })

  it('sets the title in type when there is no cover', () => {
    const button = box(item({ cover: undefined }))
    expect(within(button).queryByRole('img')).toBeNull()
    expect(button.querySelector('.cover-title')).toHaveTextContent('Hades')
  })

  it('opens on click', async () => {
    const onOpen = vi.fn()
    await userEvent.click(box(item(), 'covers', onOpen))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

describe('the design system and the data agree', () => {
  it('has a drawing for every case shape and plastic a platform can have', () => {
    expect(Object.keys(caseShapes).sort()).toEqual([...domainShapes].sort())
    expect(Object.keys(plastics).sort()).toEqual([...domainPlastics].sort())
  })
})

describe('Toolbar', () => {
  const setup = (view: 'shelf' | 'wall' | 'list' = 'shelf') => {
    const handlers = {
      onView: vi.fn(),
      onGroup: vi.fn(),
      onDensity: vi.fn(),
      onWallSize: vi.fn(),
    }
    renderWithIntl(
      <Toolbar view={view} group="platform" density="covers" wallSize="medium" {...handlers} />,
    )
    return handlers
  }

  it('offers the three views, with the current one pressed', async () => {
    const { onView } = setup()
    const views = screen.getByRole('radiogroup', { name: 'View' })
    expect(within(views).getByRole('radio', { name: 'Shelf' })).toBeChecked()
    await userEvent.click(within(views).getByRole('radio', { name: 'List' }))
    expect(onView).toHaveBeenCalledWith('list')
  })

  it('offers the four groupings from a menu', async () => {
    const { onGroup } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Platform/ }))
    const menu = screen.getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((entry) => entry.textContent),
    ).toEqual(['Platform', 'Status', 'Year', 'None'])
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Year' }))
    expect(onGroup).toHaveBeenCalledWith('year')
  })

  it('offers covers or compact on the shelf only', async () => {
    const { onDensity } = setup('shelf')
    await userEvent.click(screen.getByRole('radio', { name: 'Compact' }))
    expect(onDensity).toHaveBeenCalledWith('compact')
    expect(screen.queryByRole('radiogroup', { name: 'Cover size' })).toBeNull()
  })

  it('offers cover sizes on the wall only', async () => {
    const { onWallSize } = setup('wall')
    await userEvent.click(screen.getByRole('radio', { name: 'Large covers' }))
    expect(onWallSize).toHaveBeenCalledWith('large')
    expect(screen.queryByRole('radiogroup', { name: 'How boxes stand' })).toBeNull()
  })

  it('is labeled in Portuguese', () => {
    renderWithIntl(
      <Toolbar
        view="shelf"
        group="status"
        density="covers"
        wallSize="medium"
        onView={vi.fn()}
        onGroup={vi.fn()}
        onDensity={vi.fn()}
        onWallSize={vi.fn()}
      />,
      'pt-BR',
    )
    expect(screen.getByRole('toolbar', { name: 'Visualização da biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Estante' })).toBeChecked()
  })
})

describe('StatsLine', () => {
  it('reads out the true totals, whatever the animation is showing', () => {
    renderWithIntl(<StatsLine stats={{ games: 230, finished: 79, hours: 4236 }} />)
    const totals = screen.getByRole('group', { name: 'Library totals' })
    expect(totals).toHaveTextContent('230 games')
    expect(totals).toHaveTextContent('79 finished')
    expect(totals).toHaveTextContent('4,236 hours')
  })

  it('uses the singular for one', () => {
    renderWithIntl(<StatsLine stats={{ games: 1, finished: 1, hours: 1 }} />)
    const totals = screen.getByRole('group', { name: 'Library totals' })
    expect(totals).toHaveTextContent('1 game')
    expect(totals).toHaveTextContent('1 hour')
  })
})

describe('GamePreview', () => {
  const open = (
    entry: ShelfItem,
    handlers: { onPrevious?: () => void; onNext?: () => void } = {},
  ) =>
    renderWithIntl(
      <GamePreview
        item={entry}
        platforms={platforms}
        tags={[{ name: 'roguelike', slug: 'roguelike' }]}
        onClose={vi.fn()}
        onReturnFocus={() => false}
        {...handlers}
      />,
    )

  it('shows what is recorded about the game', () => {
    open(
      item({
        status: 'completed',
        rating: 85,
        minutes: 4020,
        length: 1320,
        igdbRating: 91,
        igdbRatingCount: 1200,
        completedOn: '2024-05-01',
        tags: [0],
      }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Hades' })
    expect(sheet).toHaveTextContent('Completed')
    expect(sheet).toHaveTextContent('Released 2020')
    expect(sheet).toHaveTextContent('8.5')
    expect(sheet).toHaveTextContent('PlayStation 5, Physical')
    expect(sheet).toHaveTextContent('67 hours')
    expect(sheet).toHaveTextContent('22 hours')
    expect(sheet).toHaveTextContent('91 of 100, from 1,200 ratings')
    expect(sheet).toHaveTextContent('March 5, 2024')
    expect(sheet).toHaveTextContent('May 1, 2024')
    expect(sheet).toHaveTextContent('roguelike')
  })

  it('leaves out what is not recorded', () => {
    open(item({ status: 'wishlist', copies: [] }))
    const sheet = screen.getByRole('dialog', { name: 'Hades' })
    expect(sheet).toHaveTextContent('Not owned')
    expect(sheet).not.toHaveTextContent('Played')
    expect(sheet).not.toHaveTextContent('Completed')
  })

  it('steps to the game before and after, by button or arrow key', async () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    open(item(), { onPrevious, onNext })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.keyboard('{ArrowLeft}')
    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('disables a step that leads nowhere', () => {
    open(item())
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('EmptyLibrary', () => {
  it('says the shelf is being stocked, in both languages', () => {
    const { unmount } = renderWithIntl(<EmptyLibrary />)
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
    expect(screen.getByText('The shelf is being stocked.')).toBeInTheDocument()
    unmount()
    renderWithIntl(<EmptyLibrary />, 'pt-BR')
    expect(screen.getByText('A estante está sendo abastecida.')).toBeInTheDocument()
  })
})

describe('format', () => {
  it('rounds minutes to whole hours', () => {
    expect(hoursOf(0)).toBe(0)
    expect(hoursOf(29)).toBe(0)
    expect(hoursOf(30)).toBe(1)
    expect(hoursOf(4020)).toBe(67)
  })

  it('shows a rating out of ten in half steps', () => {
    expect(outOfTen(100)).toBe(10)
    expect(outOfTen(85)).toBe(8.5)
    expect(outOfTen(0)).toBe(0)
  })

  it('reads a day as midnight UTC, so no time zone moves it', () => {
    expect(dateOf('2024-05-01').toISOString()).toBe('2024-05-01T00:00:00.000Z')
  })
})

describe('device preferences', () => {
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-density')
    document.documentElement.removeAttribute('data-wall-size')
  })

  const runScript = () => new Function(preferenceScript())()

  it('the head script applies the defaults when nothing is stored', () => {
    runScript()
    expect(document.documentElement).toHaveAttribute('data-density', 'covers')
    expect(document.documentElement).toHaveAttribute('data-wall-size', 'medium')
  })

  it('the head script applies what is stored, and ignores what it does not know', () => {
    window.localStorage.setItem('shelf:density', 'compact')
    window.localStorage.setItem('shelf:wall-size', 'enormous')
    runScript()
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    expect(document.documentElement).toHaveAttribute('data-wall-size', 'medium')
  })

  it('the head script survives storage being blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(runScript).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-density', 'covers')
    blocked.mockRestore()
  })

  it('a choice is stored, shown on the page, and the default is not stored at all', () => {
    writePreference(densityPreference, 'compact')
    expect(window.localStorage.getItem('shelf:density')).toBe('compact')
    expect(readPreference(densityPreference)).toBe('compact')

    writePreference(densityPreference, 'covers')
    expect(window.localStorage.getItem('shelf:density')).toBeNull()
    expect(readPreference(densityPreference)).toBe('covers')

    writePreference(wallSizePreference, 'large')
    expect(readPreference(wallSizePreference)).toBe('large')
  })
})

// The decoder is counted, not run: what matters here is when a blur is worked out.
vi.mock('thumbhash', () => ({
  thumbHashToDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
}))

describe('a cover, by when it joined the page', () => {
  const cover = { cover: 'co1abc', title: 'Hades', sizes: '120px' }

  afterEach(() => {
    resetPageLive()
    resetPreviews()
    vi.mocked(thumbHashToDataURL).mockClear()
  })

  it('came with the page: shown plainly, with no blur worked out', () => {
    expect(pageIsLive()).toBe(false)
    renderWithIntl(<Cover {...cover} hash="AAAA" />)
    expect(screen.getByRole('img', { name: 'Hades' })).not.toHaveAttribute('data-pending')
    expect(thumbHashToDataURL).not.toHaveBeenCalled()
  })

  it('stays that way when the page comes alive around it', async () => {
    function Shelf() {
      const [drawn, setDrawn] = useState(1)
      return (
        <button type="button" onClick={() => setDrawn(drawn + 1)}>
          drawn {drawn}
          <Cover {...cover} hash="BBBB" sizes={`${120 + drawn}px`} />
        </button>
      )
    }
    renderWithIntl(<Shelf />)
    markPageLive()
    await userEvent.click(screen.getByRole('button'))
    const image = screen.getByRole('img', { name: 'Hades' })
    expect(image).toHaveAttribute('sizes', '122px')
    expect(image).not.toHaveAttribute('data-pending')
    expect(thumbHashToDataURL).not.toHaveBeenCalled()
  })

  it('joined a live page: fades in at once, and its blur is worked out later, once', async () => {
    markPageLive()
    renderWithIntl(
      <>
        <Cover {...cover} hash="CCCC" />
        <Cover {...cover} hash="CCCC" title="Hades again" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'Hades' })).toHaveAttribute('data-pending')
    // Not while drawing: that is what kept a slow phone from answering.
    expect(thumbHashToDataURL).not.toHaveBeenCalled()
    await waitFor(() => expect(thumbHashToDataURL).toHaveBeenCalledTimes(1))
  })

  it('does not work out a blur for a cover whose image has already arrived', async () => {
    markPageLive()
    renderWithIntl(<Cover {...cover} hash="EEEE" />)
    fireEvent.load(screen.getByRole('img', { name: 'Hades' }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(thumbHashToDataURL).not.toHaveBeenCalled()
  })

  it('one of the first covers on a live page does not wait to be shown', () => {
    markPageLive()
    renderWithIntl(<Cover {...cover} hash="DDDD" eager />)
    expect(screen.getByRole('img', { name: 'Hades' })).not.toHaveAttribute('data-pending')
  })
})
