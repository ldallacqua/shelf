import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { removeShelfAction, saveShelfAction } from '@/app/actions/shelves'
import type { Library } from '@/domain/library/library'
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
 * The part of a library page that depends on the address: which view,
 * filtered, sorted and grouped how. It is rendered per request and streamed
 * into the frame, which was built ahead of time. On a smart shelf, the
 * shelf's own filter, sort and grouping stand in for whatever the address
 * leaves out.
 */
export async function LibraryFirstScreen({
  searchParams,
  library: pending,
  shelf,
}: {
  searchParams: Promise<Params>
  library: Promise<Library>
  shelf?: SmartShelf
}) {
  const params = await searchParams
  const query = parseLibraryQuery({
    ...params,
    q: params.q ?? shelf?.query,
    sort: params.sort ?? shelf?.sort,
    group: params.group ?? shelf?.group,
  })
  const [library, locale, request, shelves, keywords] = await Promise.all([
    pending,
    getLocale(),
    headers(),
    getShelves(),
    needsKeywords(query.q) ? getLibraryKeywords() : undefined,
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
        // Handed to everyone, used only once the browser knows the owner is here,
        // and checked again on the server whoever calls them.
        actions={{ save: saveShelfAction, remove: removeShelfAction }}
      />
    </NuqsAdapter>
  )
}
