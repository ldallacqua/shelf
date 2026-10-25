import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { thumbHashToDataURL } from 'thumbhash'
import { createTranslator } from 'next-intl'
import { type ReactNode, useState } from 'react'
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
import { LibrarySkeleton } from './library-skeleton'
import { ListView } from './list-view'
import { markPageLive, pageIsLive, resetPageLive } from './live'
import { PlaceWaiting } from './place-waiting'
import { resetPreviews } from './preview-queue'
import {
  densityPreference,
  dimensionPreference,
  adultPreference,
  preferenceScript,
  readPreference,
  wallSizePreference,
  writePreference,
} from './preferences'
import { ShelfProvider } from './shelf'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'

// The empty shelf links to the account page.
vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

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

  it('stands a wishlist game in the case of the platform it is wanted on, and says so (spec 7.5)', () => {
    const wished = item({ status: 'wishlist', copies: [], platforms: [167, 6], wanted: [6, 167] })
    const button = box(wished)
    expect(button).toHaveAccessibleName(
      'Hades (2020), not owned, Wishlist, wanted on PC and 1 more',
    )
    const view = button.querySelector('.game-case') as HTMLElement
    expect(view.style.height).toBe(`calc(var(--mm) * ${caseShapes.keepCase.height})`)
  })

  it('stands a wishlist game wanted nowhere in the first platform it came out on', () => {
    const view = box(item({ status: 'wishlist', copies: [] })).querySelector(
      '.game-case',
    ) as HTMLElement
    expect(view.style.height).toBe(`calc(var(--mm) * ${caseShapes.bluRay.height})`)
  })

  it('wears a foil seal when completed', () => {
    expect(box(item({ status: 'completed' })).querySelector('.game-seal')).not.toBeNull()
  })

  it('has no seal otherwise', () => {
    expect(box(item()).querySelector('.game-seal')).toBeNull()
  })

  it('wears a square tag when retired, and says so (spec 3.12)', () => {
    const retired = box(item({ status: 'retired' }))
    expect(retired.querySelector('.game-tag')).not.toBeNull()
    expect(retired.querySelector('.game-seal')).toBeNull()
    expect(retired).toHaveAccessibleName('Hades (2020), PS5, Physical, Retired')
  })

  it('wears a lock when only its owner sees it, and says so (spec 11.1)', () => {
    const hidden = box(item({ private: true }))
    expect(hidden.querySelector('.game-lock')).not.toBeNull()
    expect(hidden).toHaveAccessibleName('Hades (2020), PS5, Physical, Backlog, only you see it')
  })

  it('has no tag otherwise', () => {
    expect(box(item({ status: 'completed' })).querySelector('.game-tag')).toBeNull()
  })

  it('stands set back when someday, and says so (spec 3.12)', () => {
    const someday = box(item({ status: 'someday' }))
    expect(someday).toHaveAttribute('data-status', 'someday')
    expect(someday).toHaveAccessibleName('Hades (2020), PS5, Physical, Someday')
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
  const setup = (view: 'shelf' | 'wall' | 'list' = 'shelf', noThreeD = false) => {
    const handlers = {
      onView: vi.fn(),
      onGroup: vi.fn(),
      onDensity: vi.fn(),
      onWallSize: vi.fn(),
      onDimension: vi.fn(),
    }
    renderWithIntl(
      <Toolbar
        view={view}
        group="platform"
        density="covers"
        wallSize="medium"
        dimension="2d"
        noThreeD={noThreeD}
        {...handlers}
      />,
    )
    return handlers
  }

  it('offers to hide adult games only on a shelf that has any, pressed while they are hidden (spec 3.13)', async () => {
    const onChange = vi.fn()
    const toolbar = (adult?: { hidden: boolean; onChange: (hidden: boolean) => void }) => (
      <Toolbar
        view="wall"
        onView={vi.fn()}
        group="platform"
        onGroup={vi.fn()}
        density="covers"
        onDensity={vi.fn()}
        wallSize="medium"
        onWallSize={vi.fn()}
        dimension="2d"
        onDimension={vi.fn()}
        {...(adult ? { adult } : {})}
      />
    )
    renderWithIntl(toolbar())
    expect(screen.queryByRole('button', { name: 'Hide adult games' })).toBeNull()
    cleanup()
    renderWithIntl(toolbar({ hidden: true, onChange }))
    const button = screen.getByRole('button', { name: 'Hide adult games' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('offers 2D or 3D on the shelf only, with the one shown pressed', async () => {
    const { onDimension } = setup('shelf')
    const pair = screen.getByRole('radiogroup', { name: 'Shelf in 2D or 3D' })
    expect(within(pair).getByRole('radio', { name: '2D' })).toBeChecked()
    await userEvent.click(within(pair).getByRole('radio', { name: '3D' }))
    expect(onDimension).toHaveBeenCalledWith('3d')
  })

  it('has no 2D or 3D on the wall or the list', () => {
    setup('wall')
    expect(screen.queryByRole('radiogroup', { name: 'Shelf in 2D or 3D' })).toBeNull()
  })

  it('keeps 3D in reach but unavailable, with its reason, where the browser cannot draw it', async () => {
    const { onDimension } = setup('shelf', true)
    const threeD = screen.getByRole('radio', { name: '3D' })
    expect(threeD).toHaveAttribute('aria-disabled', 'true')
    expect(threeD).toHaveAccessibleDescription(
      '3D needs WebGL 2, which this browser does not offer.',
    )
    await userEvent.click(threeD)
    expect(onDimension).not.toHaveBeenCalled()
  })

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
        dimension="3d"
        onDimension={vi.fn()}
      />,
      'pt-BR',
    )
    expect(screen.getByRole('toolbar', { name: 'Visualização da biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Estante' })).toBeChecked()
    expect(screen.getByRole('radiogroup', { name: 'Estante em 2D ou 3D' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3D' })).toBeChecked()
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

describe('EmptyLibrary', () => {
  const onShelf = (children: ReactNode) => (
    <ShelfProvider
      shelf={{
        handle: 'sample',
        name: 'Sample',
        public: true,
        files: { kind: 'public', key: 'k' },
      }}
    >
      {children}
    </ShelfProvider>
  )

  it('says whose shelf is being stocked, in both languages, with nothing for a visitor to do', () => {
    const { unmount } = renderWithIntl(onShelf(<EmptyLibrary />))
    expect(screen.getByRole('heading', { level: 1, name: "Sample's shelf" })).toBeInTheDocument()
    expect(screen.getByText('The shelf is being stocked.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()
    renderWithIntl(onShelf(<EmptyLibrary />), 'pt-BR')
    expect(screen.getByText('A estante está sendo abastecida.')).toBeInTheDocument()
  })
})

describe('PlaceWaiting', () => {
  it('counts the games waiting for a status, as the way to the page for placing them', () => {
    const { unmount } = renderWithIntl(<PlaceWaiting count={180} />)
    expect(
      screen.getByRole('link', { name: 'Place the 180 games with no status' }),
    ).toHaveAttribute('href', '/en/account/unsorted')
    unmount()
    renderWithIntl(<PlaceWaiting count={1} />, 'pt-BR')
    expect(screen.getByRole('link', { name: 'Organizar o jogo sem status' })).toBeInTheDocument()
  })
})

describe('LibrarySkeleton', () => {
  it('says the library is loading, and keeps its ghosts from assistive technology', () => {
    const { container } = renderWithIntl(<LibrarySkeleton />)
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the library…')
    // Cases standing on the shelf, and nothing in them anyone could pick up.
    expect(container.querySelectorAll('.ghost-case').length).toBeGreaterThan(0)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has the smart shelf’s name when it is one', () => {
    renderWithIntl(<LibrarySkeleton title="Short ones" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Short ones' })).toBeInTheDocument()
  })
})

describe('ListView', () => {
  const nintendoSwitch: LibraryPlatform = {
    id: 130,
    key: 'switch',
    name: 'Nintendo Switch',
    short: 'Switch',
    family: 'nintendo',
    generation: 8,
    shape: 'switch',
    plastic: 'red',
  }

  it('says a physical copy is physical, a cartridge as much as a disc', () => {
    const entry = item({
      copies: [
        { platform: 167, format: 'physical' },
        { platform: 130, format: 'physical' },
        { platform: 6, format: 'digital' },
      ],
    })
    renderWithIntl(
      <ListView
        shelves={[{ kind: 'all', key: 'all', items: [entry], total: 1 }]}
        platforms={new Map([...platforms, [130, nintendoSwitch]])}
        onOpen={vi.fn()}
        enter={false}
        firstBoxes={12}
      />,
      'pt-BR',
    )
    const cell = screen.getByText('Switch').closest('td')!
    expect(cell).toHaveTextContent('PS5FísicoSwitchFísicoPCDigital')
    expect(cell).not.toHaveTextContent('Disco')
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
    document.documentElement.removeAttribute('data-adult')
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

  it('the head script hides adult games before the first paint, where this device asked (spec 3.13)', () => {
    runScript()
    expect(document.documentElement).toHaveAttribute('data-adult', 'shown')
    window.localStorage.setItem('shelf:adult', 'hidden')
    runScript()
    expect(document.documentElement).toHaveAttribute('data-adult', 'hidden')
    writePreference(adultPreference, 'shown')
    expect(window.localStorage.getItem('shelf:adult')).toBeNull()
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

describe('2D or 3D on this device', () => {
  /** A device, as the head script can tell it: which media queries match, and whether WebGL 2 exists. */
  const device = ({ desktop = false, calm = false, webgl2 = true } = {}) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion') ? calm : desktop,
    }))
    if (webgl2) vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {})
    else Reflect.deleteProperty(window, 'WebGL2RenderingContext')
  }
  const runScript = () => new Function(preferenceScript())()

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-shelf-mode')
  })

  it('starts a desktop that can draw it in 3D', () => {
    device({ desktop: true })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '3d')
  })

  it('starts a phone or a tablet in 2D', () => {
    device({ desktop: false })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '2d')
  })

  it('starts in 2D when reduced motion is asked for, or there is no WebGL 2', () => {
    device({ desktop: true, calm: true })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '2d')

    device({ desktop: true, webgl2: false })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '2d')
  })

  it('starts in 2D when the device cannot be asked', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no media queries')
    })
    expect(runScript).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '2d')
  })

  it('remembers a choice over the default, even a choice equal to it', () => {
    device({ desktop: false })
    writePreference(dimensionPreference, '2d')
    expect(window.localStorage.getItem('shelf:dimension')).toBe('2d')

    device({ desktop: true })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '2d')

    window.localStorage.setItem('shelf:dimension', '3d')
    device({ desktop: false })
    runScript()
    expect(document.documentElement).toHaveAttribute('data-shelf-mode', '3d')
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
