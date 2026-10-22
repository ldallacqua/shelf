import 'server-only'

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import type { Answer } from '@/domain/library/adding'
import type { GamePage } from '@/domain/library/game-page'
import { groupings } from '@/domain/library/group'
import type { Library } from '@/domain/library/library'
import type { SmartShelf } from '@/domain/library/shelves'
import { sortKeys } from '@/domain/library/sort'
import { statuses } from '@/domain/library/values'
import { DEFAULT_GROUPING, MAX_QUERY_LENGTH } from '@/domain/library/view'
import type { GameKeywords } from '@/domain/query/evaluate'
import {
  answerFacets,
  answerGame,
  answerLibrary,
  libraryParams,
  needsKeywords,
  toApiShelf,
} from '@/server/api/library'
import {
  apiGamePatch,
  apiNewGame,
  refusalMessage,
  toAddInput,
  toApiSearch,
  toEditPatch,
} from '@/server/api/writes'
import type { Account } from '@/server/auth/account'
import { database } from '@/server/db/client'
import { readKeywords } from '@/server/library/read'
import { readShelves } from '@/server/library/store'
import { addMyGame, searchToAdd } from '@/server/services/adding'
import { patchMine } from '@/server/services/editing'
import type { Done } from '@/server/services/for-account'
import {
  findLibrary,
  getGamePage,
  getLibrary,
  getLibraryKeywords,
  libraryTag,
  readMyGamePage,
  readMyLibrary,
} from '@/server/services/library'
import { getShelves } from '@/server/services/shelves'

/**
 * Shelf's MCP tools (architecture, section 16): the same reads and writes
 * as the API, for an assistant. Each tool answers with the API's own shapes,
 * as JSON text and as structured content. A server is made fresh for every
 * request; nothing is kept between them.
 *
 * On `/api/mcp` an assistant reads anyone's public shelf, named by its
 * handle. On `/api/mcp/owner` it works as the account that signed it in, on
 * that account's own library, private or not (ADR 004).
 */

const INFO = { name: 'shelf', title: 'Shelf', version: '1' }

const LANGUAGE = `The filter language: words search titles; key:value pairs filter, such as status:backlog, genre:rpg, owned:ps5, format:physical, year:2015..2020, rating:>=9; a minus sign excludes (-theme:horror); OR and brackets combine: (owned:ps5 format:physical) OR rating:>=9. Ratings are the library's owner's, out of ten.`

const PUBLIC_READS = `Shelf holds people's video game libraries, each a shelf of its own with a handle, as in shelf's address /u/{handle}: what they own, on which platforms, what they are playing, have finished, dropped or want. Every tool takes the shelf's handle; only public shelves answer. Read one with search_library, which takes the filter language the site uses, get_game for one game in full, list_filter_values for what each filter can take, and list_shelves for its saved smart shelves.

${LANGUAGE}`

const OWN_READS = `Shelf is a video game library, and this is yours: what you own, on which platforms, what you are playing, have finished, dropped or want. Read it with search_library, which takes the filter language the site uses, get_game for one game in full, list_filter_values for what each filter can take, and list_shelves for your saved smart shelves.

${LANGUAGE}`

const WRITES = `

You can also change your library: search_igdb finds a game to add, add_game adds it (a game already in the library only gets the copies it lacked; an edition or port of a game in the library is folded into it), update_entry changes what is yours about a game, and set_status changes only its status.`

/** Where the reads read from: one library, cached when it is public, fresh and kept nowhere when not. */
type Source = {
  /** The shelf's handle, in the addresses the answers give. */
  handle: string
  library: () => Promise<Library>
  keywords: () => Promise<GameKeywords>
  game: (slug: string) => Promise<GamePage | undefined>
  shelves: () => Promise<SmartShelf[]>
}

const publicSource = ({ id, handle }: { id: string; handle: string }): Source => ({
  handle,
  library: () => getLibrary(id),
  keywords: () => getLibraryKeywords(id),
  game: (slug) => getGamePage(id, slug),
  shelves: () => getShelves(id),
})

const ownSource = (account: Account): Source =>
  account.shelfPublic
    ? publicSource(account)
    : {
        handle: account.handle,
        library: () => readMyLibrary(account.id),
        keywords: () => readKeywords(database(), account.id),
        game: (slug) => readMyGamePage(account.id, slug),
        shelves: () => readShelves(database(), account.id),
      }

/** Which shelf a tool reads: on the public endpoint, the one its handle names, if public. */
type Pick = (args: { shelf?: unknown }) => Promise<Source | string>

const byHandle: Pick = async ({ shelf }) => {
  const handle = typeof shelf === 'string' ? shelf : ''
  const found = handle ? await findLibrary(handle) : undefined
  return found?.public ? publicSource(found) : `There is no public shelf called ${handle}.`
}

const SHELF = {
  shelf: z
    .string()
    .min(1)
    .max(40)
    .describe('Whose shelf: its handle, as in its address /u/{handle}'),
}

type ToolAnswer = CallToolResult

const data = (value: Record<string, unknown>): ToolAnswer => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  structuredContent: value,
})

const problem = (text: string): ToolAnswer => ({
  content: [{ type: 'text', text }],
  isError: true,
})

const answered = <T extends Record<string, unknown>>(result: Answer<T>): ToolAnswer =>
  result.ok ? data(result.value) : problem(refusalMessage(result))

/** After a change: every page and file built from that library is made again. */
const changed = <T extends Record<string, unknown>>(result: Done<T>): ToolAnswer => {
  if (result.ok) revalidateTag(libraryTag(result.libraryId), { expire: 0 })
  return answered(result)
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
const ENTRY = z
  .string()
  .min(1)
  .describe('The game: its address (slug), as search_library gives it, or its entry id')

/**
 * The four reads. `pick` says which library each reads; `shelf` is the
 * handle every read takes on the public endpoint, and nothing on one's own.
 */
const registerReads = (server: McpServer, pick: Pick, shelf: typeof SHELF | object) => {
  server.registerTool(
    'search_library',
    {
      title: 'Search the library',
      description:
        'The games in the library that match a filter, sorted and grouped as the site shows them, a page at a time. Also says how many match, and the shelves they make.',
      inputSchema: z.object({
        ...shelf,
        q: z
          .string()
          .max(MAX_QUERY_LENGTH)
          .default('')
          .describe('A filter in the filter language; empty for every game'),
        sort: z
          .string()
          .default('title')
          .describe(`One of ${sortKeys.join(', ')}; a minus sign first for the other way: -rating`),
        group: z.enum(groupings).default(DEFAULT_GROUPING).describe('How the shelves are made'),
        limit: z.int().min(1).max(200).default(50),
        cursor: z.string().optional().describe('`next` from the answer before, for the next page'),
        lang: z.enum(['en', 'pt-BR']).default('en').describe('For sorting titles'),
      }),
      annotations: READ_ONLY,
    },
    async (args) => {
      const source = await pick(args)
      if (typeof source === 'string') return problem(source)
      const { q, sort, group, limit, cursor, lang } = args
      const params = libraryParams.parse({ q, sort, group, limit, cursor: cursor ?? 0, lang })
      const [library, keywords] = await Promise.all([
        source.library(),
        needsKeywords(params.q) ? source.keywords() : undefined,
      ])
      return data(answerLibrary(library, params, keywords))
    },
  )

  server.registerTool(
    'get_game',
    {
      title: 'Read a game',
      description:
        'One game in full, as its page shows it: what the library’s owner has and thinks of it, its versions, and what IGDB says about it.',
      inputSchema: z.object({
        ...shelf,
        slug: z.string().min(1).describe('Its address, from search_library'),
      }),
      annotations: READ_ONLY,
    },
    async (args) => {
      const source = await pick(args)
      if (typeof source === 'string') return problem(source)
      const [library, page] = await Promise.all([source.library(), source.game(args.slug)])
      return page
        ? data(answerGame(library, page))
        : problem(`There is no game called ${args.slug}.`)
    },
  )

  server.registerTool(
    'list_filter_values',
    {
      title: 'List filter values',
      description:
        'Every value each list filter can take (genre, theme, platform, owned and so on), with how many games each would match under a filter; and the range of each number and date.',
      inputSchema: z.object({
        ...shelf,
        q: z
          .string()
          .max(MAX_QUERY_LENGTH)
          .default('')
          .describe('Count within this filter; empty for the whole library'),
      }),
      annotations: READ_ONLY,
    },
    async (args) => {
      const source = await pick(args)
      if (typeof source === 'string') return problem(source)
      const [library, keywords] = await Promise.all([
        source.library(),
        needsKeywords(args.q) ? source.keywords() : undefined,
      ])
      return data(answerFacets(library, args.q, keywords))
    },
  )

  server.registerTool(
    'list_shelves',
    {
      title: 'List smart shelves',
      description:
        'The saved smart shelves: each a name and a filter, sort and grouping. Pass its query to search_library to see its games.',
      inputSchema: z.object({ ...shelf }),
      annotations: READ_ONLY,
    },
    async (args) => {
      const source = await pick(args)
      if (typeof source === 'string') return problem(source)
      return data({ shelves: (await source.shelves()).map(toApiShelf(source.handle)) })
    },
  )
}

const registerWrites = (server: McpServer) => {
  server.registerTool(
    'search_igdb',
    {
      title: 'Search IGDB',
      description:
        'Games on IGDB, to add: up to eight, editions left out and ports folded in, each marked when the library already has it.',
      inputSchema: z.object({ q: z.string().trim().min(2).max(100).describe('A title') }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ q }) => {
      const result = await searchToAdd(q)
      return answered(result.ok ? { ok: true, value: toApiSearch(result.value) } : result)
    },
  )

  server.registerTool(
    'add_game',
    {
      title: 'Add a game',
      description:
        'Adds a game from IGDB, by its id from search_igdb, with how it is owned. A game the library has gets only the copies it lacked.',
      inputSchema: apiNewGame,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      const result = await addMyGame(toAddInput(input))
      return changed(
        result.ok
          ? {
              ok: true,
              value: {
                slug: result.value.slug,
                title: result.value.title,
                version: result.value.version,
              },
              libraryId: result.libraryId,
            }
          : result,
      )
    },
  )

  server.registerTool(
    'update_entry',
    {
      title: 'Change a game',
      description:
        'Changes what is mine about a game, in one step: status, rating out of ten, completion date, notes and whether visitors may read them, tags (all of them: replaces), hours played. Absent fields are left as they are; null clears.',
      inputSchema: z.object({ id: ENTRY, ...apiGamePatch.shape }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, ...patch }) => changed(await patchMine(id, toEditPatch(patch))),
  )

  server.registerTool(
    'set_status',
    {
      title: 'Set a game’s status',
      description: 'Playing, backlog, completed, dropped or wishlist: nothing else changes.',
      inputSchema: z.object({ id: ENTRY, status: z.enum(statuses) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, status }) => changed(await patchMine(id, { mine: { status } })),
  )
}

/** `/api/mcp`: anyone's public shelf, by its handle, for reading. */
export const publicMcpServer = (): McpServer => {
  const server = new McpServer(INFO, { instructions: PUBLIC_READS })
  registerReads(server, byHandle, SHELF)
  return server
}

/**
 * `/api/mcp/owner`: the library of the account that signed the assistant
 * in, for reading and changing. Its writes run as that account
 * (`asAccount`, in the route), so they reach its library only.
 */
export const ownerMcpServer = (account: Account): McpServer => {
  const server = new McpServer(INFO, { instructions: OWN_READS + WRITES })
  const source = ownSource(account)
  registerReads(server, async () => source, {})
  registerWrites(server)
  return server
}
