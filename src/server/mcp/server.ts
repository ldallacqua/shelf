import 'server-only'

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import type { Answer } from '@/domain/library/adding'
import { groupings } from '@/domain/library/group'
import { sortKeys } from '@/domain/library/sort'
import { statuses } from '@/domain/library/values'
import { DEFAULT_GROUPING, MAX_QUERY_LENGTH } from '@/domain/library/view'
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
import { addGameForOwner, searchToAdd } from '@/server/services/adding'
import { patchForOwner } from '@/server/services/editing'
import { getGamePage, getLibrary, getLibraryKeywords, LIBRARY_TAG } from '@/server/services/library'
import { getShelves } from '@/server/services/shelves'

/**
 * Shelf's MCP tools (architecture, section 16): the same reads and writes
 * as the API, for an assistant. Each tool answers with the API's own shapes,
 * as JSON text and as structured content. A server is made fresh for every
 * request; nothing is kept between them.
 */

const INFO = { name: 'shelf', title: 'Shelf', version: '1' }

const READS = `Shelf is one person's video game library: what they own, on which platforms, what they are playing, have finished, dropped or want. Read it with search_library, which takes the filter language the site uses, get_game for one game in full, list_filter_values for what each filter can take, and list_shelves for the saved smart shelves.

The filter language: words search titles; key:value pairs filter, such as status:backlog, genre:rpg, owned:ps5, format:physical, year:2015..2020, rating:>=9; a minus sign excludes (-theme:horror); OR and brackets combine: (owned:ps5 format:physical) OR rating:>=9. Ratings are the owner's, out of ten.`

const WRITES = `

As the owner, you can also change the library: search_igdb finds a game to add, add_game adds it (a game already in the library only gets the copies it lacked; an edition or port of a game in the library is folded into it), update_entry changes what is mine about a game, and set_status changes only its status.`

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

/** After a change: every page and file built from the library is made again. */
const changed = <T extends Record<string, unknown>>(result: Answer<T>): ToolAnswer => {
  if (result.ok) revalidateTag(LIBRARY_TAG, { expire: 0 })
  return answered(result)
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
const ENTRY = z
  .string()
  .min(1)
  .describe('The game: its address (slug), as search_library gives it, or its entry id')

const registerReads = (server: McpServer) => {
  server.registerTool(
    'search_library',
    {
      title: 'Search the library',
      description:
        'The games in the library that match a filter, sorted and grouped as the site shows them, a page at a time. Also says how many match, and the shelves they make.',
      inputSchema: z.object({
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
    async ({ q, sort, group, limit, cursor, lang }) => {
      const params = libraryParams.parse({ q, sort, group, limit, cursor: cursor ?? 0, lang })
      const [library, keywords] = await Promise.all([
        getLibrary(),
        needsKeywords(params.q) ? getLibraryKeywords() : undefined,
      ])
      return data(answerLibrary(library, params, keywords))
    },
  )

  server.registerTool(
    'get_game',
    {
      title: 'Read a game',
      description:
        'One game in full, as its page shows it: what the owner has and thinks of it, its versions, and what IGDB says about it.',
      inputSchema: z.object({
        slug: z.string().min(1).describe('Its address, from search_library'),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const [library, page] = await Promise.all([getLibrary(), getGamePage(slug)])
      return page ? data(answerGame(library, page)) : problem(`There is no game called ${slug}.`)
    },
  )

  server.registerTool(
    'list_filter_values',
    {
      title: 'List filter values',
      description:
        'Every value each list filter can take (genre, theme, platform, owned and so on), with how many games each would match under a filter; and the range of each number and date.',
      inputSchema: z.object({
        q: z
          .string()
          .max(MAX_QUERY_LENGTH)
          .default('')
          .describe('Count within this filter; empty for the whole library'),
      }),
      annotations: READ_ONLY,
    },
    async ({ q }) => {
      const [library, keywords] = await Promise.all([
        getLibrary(),
        needsKeywords(q) ? getLibraryKeywords() : undefined,
      ])
      return data(answerFacets(library, q, keywords))
    },
  )

  server.registerTool(
    'list_shelves',
    {
      title: 'List smart shelves',
      description:
        'The saved smart shelves: each a name and a filter, sort and grouping. Pass its query to search_library to see its games.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => data({ shelves: (await getShelves()).map(toApiShelf) }),
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
      const result = await addGameForOwner(toAddInput(input))
      return changed(
        result.ok
          ? {
              ok: true,
              value: {
                slug: result.value.slug,
                title: result.value.title,
                version: result.value.version,
              },
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
    async ({ id, ...patch }) => changed(await patchForOwner(id, toEditPatch(patch))),
  )

  server.registerTool(
    'set_status',
    {
      title: 'Set a game’s status',
      description: 'Playing, backlog, completed, dropped or wishlist: nothing else changes.',
      inputSchema: z.object({ id: ENTRY, status: z.enum(statuses) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, status }) => changed(await patchForOwner(id, { mine: { status } })),
  )
}

/** `/api/mcp`: anyone's, for reading. */
export const publicMcpServer = (): McpServer => {
  const server = new McpServer(INFO, { instructions: READS })
  registerReads(server)
  return server
}

/** `/api/mcp/owner`: mine, through an assistant I signed in, for reading and changing. */
export const ownerMcpServer = (): McpServer => {
  const server = new McpServer(INFO, { instructions: READS + WRITES })
  registerReads(server)
  registerWrites(server)
  return server
}
