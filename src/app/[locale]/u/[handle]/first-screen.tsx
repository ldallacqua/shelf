import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'
import { getLocale } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { removeShelfAction, saveShelfAction } from '@/app/actions/shelves'
import type { Library } from '@/domain/library/library'
import {
  ARRANGEMENT_COOKIE,
  completionOf,
  namesArrangement,
  readRemembered,
} from '@/domain/library/remembered'
import type { SmartShelf } from '@/domain/library/shelves'
import {
  buildFirstScreen,
  FIRST_BOXES,
  FIRST_BOXES_PHONE,
  parseLibraryQuery,
} from '@/domain/library/view'
import { EmptyLibrary } from '@/features/library/empty-library'
import { LibraryView } from '@/features/library/library-view'
import { StatsLine } from '@/features/library/stats-line'
import { needsKeywords } from '@/server/api/library'
import { isPhone } from '@/server/device'
import { getLibraryKeywords } from '@/server/services/library'
import { getShelves } from '@/server/services/shelves'

type Params = Record<string, string | string[] | undefined>

/**
 * The part of a public library's page that depends on the address: which
 * view, filtered, sorted and grouped how. It is rendered per request and
 * streamed into the frame, which was built ahead of time. On a smart shelf,
 * the shelf's own filter, sort and grouping stand in for whatever the
 * address leaves out. An address that names no view, grouping or sort is
 * arranged as this device last left a library (issue 149), read from its
 * cookie: this part is drawn for each visit anyway, so reading it costs
 * nothing more, and the first screen arrives already arranged.
 */
export async function LibraryFirstScreen({
  searchParams,
  libraryId,
  library: pending,
  shelf,
}: {
  searchParams: Promise<Params>
  libraryId: string
  library: Promise<Library>
  shelf?: SmartShelf
}) {
  const params = await searchParams
  const remembered = namesArrangement(params)
    ? {}
    : readRemembered((await cookies()).get(ARRANGEMENT_COOKIE)?.value)
  // A remembered shuffle takes a new seed, which only a visit can have.
  if (remembered.sort === 'random') await connection()
  const completion = completionOf(remembered, { smart: shelf !== undefined })
  const arranged = { ...params, ...completion }
  const query = parseLibraryQuery({
    ...arranged,
    q: params.q ?? shelf?.query,
    sort: arranged.sort ?? shelf?.sort,
    group: arranged.group ?? shelf?.group,
  })
  const [library, locale, request, shelves, keywords] = await Promise.all([
    pending,
    getLocale(),
    headers(),
    getShelves(libraryId),
    needsKeywords(query.q) ? getLibraryKeywords(libraryId) : undefined,
  ])
  if (library.games.length === 0) return <EmptyLibrary />

  // A phone shows fewer boxes at once, so it is sent fewer. A wrong guess
  // costs nothing but a moment: the rest arrive with the library file.
  const boxes = isPhone(request) ? FIRST_BOXES_PHONE : FIRST_BOXES
  const first = buildFirstScreen(library, query, locale, boxes, keywords)
  return (
    // Lets the library keep its view, filter, sort and grouping in the
    // address. Only these pages need it, so only they carry its code.
    <NuqsAdapter>
      <LibraryView
        first={first}
        stats={<StatsLine stats={first.stats} />}
        shelves={shelves}
        shelf={shelf}
        completion={completion}
        // Handed to everyone, used only once the browser knows this shelf is the
        // account's own, and checked again on the server whoever calls them.
        actions={{ save: saveShelfAction, remove: removeShelfAction }}
      />
    </NuqsAdapter>
  )
}
