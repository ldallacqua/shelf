import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps, ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Sort } from '@/domain/library/sort'
import { testGame, testLibrary } from '@/domain/library/testing'
import { buildIndex } from '@/domain/query/evaluate'
import { parseQuery } from '@/domain/query/parse'
import { writeQuery } from '@/domain/query/write'
import { messages, renderWithIntl } from '@/test/render'

import { FILTERS_BESIDE, useFiltersBeside } from './beside'
import { FilterChips } from './filter-chips'
import { FilterPanel } from './filter-panel'
import { ListSection } from './list-section'
import { ResultStatus } from './result-status'
import { SEARCH_ID, SearchField } from './search-field'
import { SortControl } from './sort-control'
import { StatusRow } from './status-row'

/**
 * The controls that find games (spec 3.1, 5 and 6), each on its own. What
 * they do to a filter is tested in src/domain/query; here, what a person
 * sees and presses.
 */

const intl = (ui: ReactElement) => (
  <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
    {ui}
  </NextIntlClientProvider>
)

const index = buildIndex(
  testLibrary([testGame('Chrono Trigger', { genres: [12], themes: [19] })], {
    genre: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
    theme: [{ id: 19, name: 'Horror', slug: 'horror' }],
  }),
)

describe('SearchField', () => {
  it('reports each change, and says when a search is being typed', async () => {
    const onChange = vi.fn()
    renderWithIntl(<SearchField value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the library' }), 'ze')
    // The first letter starts a step in the history; the rest replace it.
    expect(onChange.mock.calls).toEqual([
      ['z', false],
      ['ze', true],
    ])
  })

  it('Escape empties it', async () => {
    const onChange = vi.fn()
    renderWithIntl(<SearchField value="zelda" onChange={onChange} />)
    const field = screen.getByRole('searchbox')
    await userEvent.click(field)
    await userEvent.keyboard('{Escape}')
    expect(field).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith('', false)
  })

  it('follows the address when it changes from elsewhere, even while typing in it', async () => {
    const { rerender } = render(intl(<SearchField value="" onChange={() => {}} />))
    const field = screen.getByRole('searchbox')
    await userEvent.type(field, 'zelda')
    // The address echoes what was typed: nothing moves.
    rerender(intl(<SearchField value="zelda" onChange={() => {}} />))
    expect(field).toHaveValue('zelda')
    expect(field).toHaveFocus()
    // Back, with the field still focused: it shows what the address says now.
    act(() => rerender(intl(<SearchField value="" onChange={() => {}} />)))
    expect(field).toHaveValue('')
  })

  it('says how many parts it could not understand', () => {
    renderWithIntl(<SearchField value="halo:3 zelda" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveAccessibleDescription(
      'One part was not understood and is ignored.',
    )
  })
})

describe('StatusRow', () => {
  it('shows each status with its count, and presses the one the filter is set to', async () => {
    const onChange = vi.fn()
    renderWithIntl(
      <StatusRow
        value="playing"
        counts={{ playing: 6, backlog: 92, completed: 79, dropped: 20, wishlist: 33 }}
        onChange={onChange}
      />,
    )
    const row = screen.getByRole('radiogroup', { name: 'Status' })
    expect(within(row).getByRole('radio', { name: 'Playing, 6 games' })).toBeChecked()
    await userEvent.click(within(row).getByRole('radio', { name: 'Backlog, 92 games' }))
    expect(onChange).toHaveBeenCalledWith('backlog')
  })

  it('presses nothing when the filter says something it cannot show', () => {
    renderWithIntl(<StatusRow value={undefined} onChange={() => {}} />)
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('shows Unsorted only on a shelf that has unsorted games, even where the filter matches none', () => {
    const counts = {
      playing: 6,
      backlog: 92,
      completed: 79,
      dropped: 20,
      wishlist: 33,
      unsorted: 0,
    }
    const { rerender } = render(intl(<StatusRow value="all" counts={counts} onChange={() => {}} />))
    expect(screen.queryByRole('radio', { name: /Unsorted/ })).toBeNull()
    rerender(
      intl(<StatusRow value="all" counts={counts} onShelf={['unsorted']} onChange={() => {}} />),
    )
    expect(screen.getByRole('radio', { name: 'Unsorted, 0 games' })).toBeInTheDocument()
  })

  it('shows Someday and Retired only on a shelf that uses them, in their place in the order', () => {
    const counts = { playing: 6, backlog: 92, completed: 79, dropped: 20, wishlist: 33 }
    const { rerender } = render(intl(<StatusRow value="all" counts={counts} onChange={() => {}} />))
    expect(screen.queryByRole('radio', { name: /Someday|Retired/ })).toBeNull()
    rerender(
      intl(
        <StatusRow
          value="all"
          counts={{ ...counts, someday: 4, retired: 0 }}
          onShelf={['someday', 'retired']}
          onChange={() => {}}
        />,
      ),
    )
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'All',
      'Playing6',
      'Backlog92',
      'Someday4',
      'Completed79',
      'Retired0',
      'Dropped20',
      'Wishlist33',
    ])
  })

  it('scrolls the row, and only the row, to the status pressed past its edge', () => {
    const at = (left: number, width: number) => ({ left, right: left + width }) as DOMRect
    const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      // A phone's row, 390 pixels wide, with Unsorted 500 pixels along it and All at its start.
      if (this.getAttribute('role') === 'radiogroup') return at(0, 390)
      return this.textContent?.startsWith('Unsorted') ? at(500, 90) : at(16, 40)
    })
    const counts = {
      playing: 6,
      backlog: 92,
      completed: 79,
      dropped: 20,
      wishlist: 33,
      unsorted: 7,
    }
    const { rerender } = render(intl(<StatusRow value="all" counts={counts} onChange={() => {}} />))
    const row = screen.getByRole('radiogroup', { name: 'Status' })
    rerender(intl(<StatusRow value="unsorted" counts={counts} onChange={() => {}} />))
    expect(row.scrollLeft).toBe(500 + 90 - 390 + 16)
    rects.mockRestore()
  })
})

describe('FilterChips', () => {
  const chipsFor = (text: string, onRemove = vi.fn(), onRemoveProblem = vi.fn()) => {
    const parsed = parseQuery(text)
    renderWithIntl(
      <FilterChips
        tree={parsed.tree}
        problems={parsed.problems}
        index={index}
        onRemove={onRemove}
        onRemoveProblem={onRemoveProblem}
        onClear={() => {}}
      />,
    )
    return screen.queryByRole('group', { name: 'Active filters' })
  }

  it('says each condition in words, with "or" between groups', () => {
    const chips = chipsFor('genre:rpg -theme:horror OR zelda')!
    expect(chips).toHaveTextContent('Genre: Role-playing (RPG)')
    expect(chips).toHaveTextContent('Not theme: Horror')
    expect(chips).toHaveTextContent('or')
    expect(chips).toHaveTextContent('Title: zelda')
  })

  it('removes one condition at a time', async () => {
    const onRemove = vi.fn()
    chipsFor('genre:rpg -theme:horror', onRemove)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Not theme: Horror' }))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ group: 0, index: 1 }))
  })

  it('strikes through what it could not understand, and says why', async () => {
    const onRemoveProblem = vi.fn()
    chipsFor('halo:3 zelda', vi.fn(), onRemoveProblem)
    const remove = screen.getByRole('button', { name: 'Remove halo:3' })
    expect(remove).toHaveAttribute('title', 'There is no filter by that name.')
    await userEvent.click(remove)
    expect(onRemoveProblem).toHaveBeenCalledWith(expect.objectContaining({ text: 'halo:3' }))
  })

  it('shows nothing without a filter', () => {
    expect(chipsFor('')).toBeNull()
  })
})

describe('SortControl', () => {
  const sortControl = (sort: Sort) => {
    const onSort = vi.fn()
    const onShuffle = vi.fn()
    renderWithIntl(
      <SortControl
        sort={sort}
        onSort={onSort}
        onShuffle={onShuffle}
        open
        onOpenChange={() => {}}
      />,
    )
    return { onSort, onShuffle }
  }

  it('starts a key the way it is usually wanted: a rating highest first', async () => {
    const { onSort } = sortControl({ key: 'title', descending: false })
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'My rating' }))
    expect(onSort).toHaveBeenCalledWith({ key: 'rating', descending: true })
  })

  it('reverses with its button, which says which way it runs now', async () => {
    const { onSort } = sortControl({ key: 'rating', descending: true })
    await userEvent.click(screen.getByRole('button', { name: 'My rating, descending' }))
    expect(onSort).toHaveBeenCalledWith({ key: 'rating', descending: false })
  })

  it('Surprise me has no direction: its button shuffles again', async () => {
    const { onShuffle } = sortControl({ key: 'random', descending: false })
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle again' }))
    expect(onShuffle).toHaveBeenCalled()
  })
})

describe('ResultStatus', () => {
  const title: Sort = { key: 'title', descending: false }
  const said = () => screen.getByRole('status')
  const settle = () => act(() => vi.advanceTimersByTime(1000))
  afterEach(() => vi.useRealTimers())

  it('says nothing for the address the page opened at', () => {
    vi.useFakeTimers()
    render(intl(<ResultStatus q="" sort={title} count={230} />))
    settle()
    expect(said()).toBeEmptyDOMElement()
  })

  it('says what a filter or a sort leaves, once it settles (spec 13)', () => {
    vi.useFakeTimers()
    const { rerender } = render(intl(<ResultStatus q="" sort={title} count={230} />))
    rerender(intl(<ResultStatus q="genre:rpg" sort={title} count={42} />))
    // Not at each letter typed.
    expect(said()).toBeEmptyDOMElement()
    settle()
    expect(said()).toHaveTextContent('42 games, sorted by Title, ascending')

    const rating: Sort = { key: 'rating', descending: true }
    rerender(intl(<ResultStatus q="genre:rpg" sort={rating} count={42} />))
    settle()
    expect(said()).toHaveTextContent('42 games, sorted by My rating, descending')

    // Back where it opened is a change too.
    rerender(intl(<ResultStatus q="" sort={{ key: 'random', descending: false }} count={1} />))
    settle()
    expect(said()).toHaveTextContent('1 game, shuffled')
  })

  it('leaves no match to the empty shelf to say', () => {
    vi.useFakeTimers()
    const { rerender } = render(intl(<ResultStatus q="" sort={title} count={230} />))
    rerender(intl(<ResultStatus q="zzz" sort={title} count={0} />))
    settle()
    expect(said()).toBeEmptyDOMElement()
  })
})

describe('ListSection', () => {
  const section = (include: string[] = [], exclude: string[] = []) => {
    const onChange = vi.fn()
    renderWithIntl(
      <ListSection
        filterKey="genre"
        label="Genre"
        condition={{ include, all: false, exclude }}
        values={[
          { word: 'rpg', name: 'Role-playing (RPG)', count: 86 },
          { word: 'strategy', name: 'Strategy', count: 0 },
        ]}
        labelOf={(word) => (word === 'rpg' ? 'Role-playing (RPG)' : 'Strategy')}
        isEnglish={() => true}
        onChange={onChange}
      />,
    )
    return onChange
  }

  it('with a mouse, a value cycles: off, included, excluded, off (spec 5.2)', async () => {
    const onChange = section(['rpg'])
    await userEvent.click(
      screen.getByRole('button', { name: 'Role-playing (RPG), 86 games, included' }),
    )
    expect(onChange).toHaveBeenCalledWith({ include: [], all: false, exclude: ['rpg'] })
  })

  it('on touch, each value has its own include and exclude buttons', async () => {
    const onChange = section()
    const include = screen.getByRole('button', { name: 'Include Role-playing (RPG), 86 games' })
    expect(include).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Exclude Role-playing (RPG)' }))
    expect(onChange).toHaveBeenCalledWith({ include: [], all: false, exclude: ['rpg'] })
  })

  it('offers any or all once two values are included', async () => {
    const onChange = section(['rpg', 'strategy'])
    await userEvent.click(screen.getByRole('radio', { name: 'All of' }))
    expect(onChange).toHaveBeenCalledWith({ include: ['rpg', 'strategy'], all: true, exclude: [] })
  })

  it('dims a value that would match nothing', () => {
    section()
    const strategy = screen.getByRole('button', { name: 'Strategy, 0 games' }).closest('li')
    expect(strategy).toHaveAttribute('data-empty')
  })
})

describe('FilterPanel: beside the library, or in a sheet (issue #62)', () => {
  const panel = (
    beside: boolean | undefined,
    open: boolean,
    props: Partial<ComponentProps<typeof FilterPanel>> = {},
  ) => (
    <FilterPanel
      open={open}
      onOpenChange={() => {}}
      beside={beside}
      tree={undefined}
      index={index}
      matching={1}
      onChange={() => {}}
      onClear={() => {}}
      onWantKeywords={() => {}}
      {...props}
    />
  )
  const column = () => screen.getByRole('complementary', { name: 'Filters' })

  it('on a wide window is a column of its own, counting, and never a sheet', () => {
    renderWithIntl(panel(true, true))
    expect(within(column()).getByText('1 game matches')).toBeInTheDocument()
    expect(within(column()).getByRole('button', { name: 'Backlog, 1 game' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('holds the column’s place with ghosts until the window’s width is known', () => {
    renderWithIntl(panel(undefined, false))
    expect(column().querySelector('details')).not.toBeInTheDocument()
    expect(column().querySelector('.ghost')).toBeInTheDocument()
  })

  it('on a narrower window leaves the hidden column empty, and opens as a sheet', () => {
    renderWithIntl(panel(false, true))
    // The sheet is modal: everything else, the column too, is hidden from assistive technology.
    const hidden = screen.getByRole('complementary', { name: 'Filters', hidden: true })
    expect(hidden.querySelector('details')).not.toBeInTheDocument()
    // Nothing is on its way, so no ghost says so: a page settles once its ghosts are gone.
    expect(hidden.querySelector('.ghost')).not.toBeInTheDocument()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(within(sheet).getByRole('button', { name: 'Backlog, 1 game' })).toBeInTheDocument()
  })

  it('changes the filter from the column, and clears it', async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()
    const { rerender } = render(intl(panel(true, false, { onChange, onClear })))
    await userEvent.click(within(column()).getByRole('button', { name: 'Backlog, 1 game' }))
    expect(writeQuery(onChange.mock.calls[0]![0])).toBe('status:backlog')
    rerender(intl(panel(true, false, { onChange, onClear, tree: onChange.mock.calls[0]![0] })))
    await userEvent.click(within(column()).getByRole('button', { name: 'Clear all' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('keeps the sections opened in the sheet open in the column when the window widens', async () => {
    const { rerender } = render(intl(panel(false, true)))
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    await userEvent.click(within(sheet).getByText('Theme'))
    rerender(intl(panel(true, false)))
    expect(column().querySelector('details[data-filter="theme"]')).toHaveAttribute('open')
    expect(within(column()).getByRole('button', { name: 'Horror, 1 game' })).toBeInTheDocument()
  })

  it('starts with a way past every filter, to the search field', async () => {
    renderWithIntl(
      <>
        {panel(true, false)}
        <input id={SEARCH_ID} aria-label="Search" />
      </>,
    )
    const skip = within(column()).getAllByRole('button')[0]!
    expect(skip).toHaveAccessibleName('Skip the filters')
    await userEvent.click(skip)
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()
  })
})

describe('useFiltersBeside', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('follows the window across the width where the filters stand beside the library', () => {
    let wide = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query === FILTERS_BESIDE && wide
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }))
    const { result } = renderHook(() => useFiltersBeside())
    expect(result.current).toBe(false)
    act(() => {
      wide = true
      for (const listener of listeners) listener()
    })
    expect(result.current).toBe(true)
  })
})
