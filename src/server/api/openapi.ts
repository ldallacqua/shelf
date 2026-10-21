import 'server-only'

import { z } from 'zod'

import { sortKeys } from '@/domain/library/sort'
import { groupings } from '@/domain/library/group'
import { siteUrl } from '@/server/site-url'

import {
  apiError,
  apiGame,
  apiGamePage,
  apiShelf,
  facetsAnswer,
  libraryAnswer,
  shelfOutline,
  shelvesAnswer,
} from './library'
import {
  apiAdded,
  apiAdditions,
  apiAddUndo,
  apiChanged,
  apiCopyPatch,
  apiGamePatch,
  apiLineMatch,
  apiListMatch,
  apiNewCopy,
  apiNewGame,
  apiNewGames,
  apiOwnerGame,
  apiPastedLines,
  apiRemoved,
  apiRestored,
  apiSearchAnswer,
  apiSearchResult,
  apiUndoAdditions,
} from './writes'

/**
 * The API's own description, as OpenAPI 3.1, made from the same Zod schemas
 * the routes check their answers against.
 */

const json = (ref: string) => ({
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
})

const query = (name: string, description: string, schema: Record<string, unknown>) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
})

/** The owner's session: what every write takes. */
const OWNER = [{ ownerSession: [] }]

/** How a write is turned down. */
const REFUSALS = {
  400: { description: 'The body is not one Shelf can carry out', ...json('Error') },
  401: { description: 'Not the owner’s session', ...json('Error') },
  404: { description: 'No such game', ...json('Error') },
  409: { description: 'That is there already', ...json('Error') },
  503: { description: 'This deployment keeps nothing it is given', ...json('Error') },
}

const ENTRY = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'The entry’s id, or the address (slug) of any of its versions',
  schema: { type: 'string' },
}

const COPY = {
  name: 'copy',
  in: 'path',
  required: true,
  description: 'The copy’s id, from GET /entries/{id}',
  schema: { type: 'string' },
}

export const openApiDocument = () => {
  // Every schema with an id becomes a component; a schema inside another is a reference to it.
  const registry = z.registry<{ id: string }>()
  for (const schema of [
    libraryAnswer,
    facetsAnswer,
    shelvesAnswer,
    apiShelf,
    apiGame,
    apiGamePage,
    shelfOutline,
    apiError,
    apiSearchResult,
    apiSearchAnswer,
    apiNewGame,
    apiAdded,
    apiGamePatch,
    apiChanged,
    apiRemoved,
    apiOwnerGame,
    apiNewCopy,
    apiCopyPatch,
    apiRestored,
    apiPastedLines,
    apiLineMatch,
    apiListMatch,
    apiNewGames,
    apiAddUndo,
    apiAdditions,
    apiUndoAdditions,
  ]) {
    registry.add(schema, { id: (schema.meta() as { id: string }).id })
  }
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: 'draft-2020-12',
  })

  const filter = query(
    'q',
    'A filter in the filter language: `status:backlog genre:rpg -theme:horror`, `year:2015..2020`, `(owned:ps5 format:physical) OR rating:>=9`. See /llms.txt.',
    { type: 'string', maxLength: 1000 },
  )

  return {
    openapi: '3.1.0',
    info: {
      title: 'Shelf',
      version: '1',
      description:
        'A personal game library. Every read is public. Writes are the owner’s alone: they take the session cookie that signing in on the site sets, and answer 401 without it.',
    },
    servers: [{ url: `${siteUrl()}/api/v1` }],
    paths: {
      '/library': {
        get: {
          summary: 'The library, filtered, sorted and grouped',
          parameters: [
            filter,
            query('sort', 'A sort key; `-` in front reverses it', {
              type: 'string',
              enum: sortKeys.flatMap((key) => (key === 'random' ? [key] : [key, `-${key}`])),
              default: 'title',
            }),
            query('group', 'How the shelves are made', {
              type: 'string',
              enum: groupings,
              default: 'platform',
            }),
            query('seed', 'With `sort=random`: the same seed, the same order', {
              type: 'string',
              pattern: '^[a-zA-Z0-9]{1,16}$',
            }),
            query('limit', 'Games per page', {
              type: 'integer',
              minimum: 1,
              maximum: 200,
              default: 50,
            }),
            query('cursor', 'From the previous page’s `next`', { type: 'string' }),
            query('lang', 'The alphabet titles are sorted in', {
              type: 'string',
              enum: ['en', 'pt-BR'],
              default: 'en',
            }),
          ],
          responses: { 200: { description: 'One page of matching games', ...json('Library') } },
        },
      },
      '/library/facets': {
        get: {
          summary: 'Every value a filter can take, with how many games each would match',
          parameters: [filter],
          responses: { 200: { description: 'Values and counts', ...json('Facets') } },
        },
      },
      '/games/{slug}': {
        get: {
          summary: 'One game, with everything its page shows a visitor',
          parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'The game', ...json('GamePage') },
            404: { description: 'No game in the library has that slug', ...json('Error') },
          },
        },
      },
      '/igdb/search': {
        get: {
          summary: 'Search IGDB for a game to add. The owner only.',
          security: OWNER,
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'A title, two characters or more',
              schema: { type: 'string', minLength: 2, maxLength: 100 },
            },
          ],
          responses: {
            200: { description: 'Up to eight games', ...json('IgdbSearch') },
            ...REFUSALS,
          },
        },
      },
      '/igdb/match': {
        post: {
          summary:
            'Match a pasted list against IGDB, up to twenty lines at a time. The owner only.',
          description:
            'Each line gets its match, how sure it is, and alternatives. Nothing is added: send the games chosen to POST /additions.',
          security: OWNER,
          requestBody: { required: true, ...json('PastedLines') },
          responses: {
            200: { description: 'One match a line, in order', ...json('ListMatch') },
            ...REFUSALS,
          },
        },
      },
      '/additions': {
        post: {
          summary: 'Add many games at once, up to fifty. The owner only.',
          description:
            'Each is added as POST /entries would add it, in order, so a game can fold into one added before it. One that fails leaves the rest.',
          security: OWNER,
          requestBody: { required: true, ...json('NewGames') },
          responses: {
            200: { description: 'One result a game, in order', ...json('Additions') },
            ...REFUSALS,
          },
        },
      },
      '/additions/undo': {
        post: {
          summary: 'Take back what POST /additions added. The owner only.',
          security: OWNER,
          requestBody: { required: true, ...json('UndoAdditions') },
          responses: { 200: { description: 'Taken back', ...json('Changed') }, ...REFUSALS },
        },
      },
      '/entries': {
        post: {
          summary: 'Add a game from IGDB. The owner only.',
          description:
            'A game related to one in the library (an edition, a port, a remaster) is folded into it or kept apart as ADR 001 proposes, unless `grouping` says otherwise. A game already in the library gets only the copies it lacked.',
          security: OWNER,
          requestBody: { required: true, ...json('NewGame') },
          responses: {
            201: { description: 'Added', ...json('Added') },
            ...REFUSALS,
          },
        },
      },
      '/entries/{id}': {
        get: {
          summary:
            'A game as its owner keeps it: private notes, its versions and copies, with ids. The owner only.',
          security: OWNER,
          parameters: [ENTRY],
          responses: { 200: { description: 'The game', ...json('OwnerGame') }, ...REFUSALS },
        },
        patch: {
          summary: 'Change what is mine about a game, in one step. The owner only.',
          security: OWNER,
          parameters: [ENTRY],
          requestBody: { required: true, ...json('GamePatch') },
          responses: { 200: { description: 'Changed', ...json('Changed') }, ...REFUSALS },
        },
        delete: {
          summary: 'Remove a game, with everything added with it. The owner only.',
          security: OWNER,
          parameters: [ENTRY],
          responses: { 200: { description: 'Removed', ...json('Removed') }, ...REFUSALS },
        },
      },
      '/entries/{id}/copies': {
        post: {
          summary: 'Add a copy: a platform and format I own the game on. The owner only.',
          security: OWNER,
          parameters: [ENTRY],
          requestBody: { required: true, ...json('NewCopy') },
          responses: { 201: { description: 'Added', ...json('Changed') }, ...REFUSALS },
        },
      },
      '/entries/{id}/copies/{copy}': {
        patch: {
          summary: 'Switch a copy between physical and digital. The owner only.',
          security: OWNER,
          parameters: [ENTRY, COPY],
          requestBody: { required: true, ...json('CopyPatch') },
          responses: { 200: { description: 'Changed', ...json('Changed') }, ...REFUSALS },
        },
        delete: {
          summary: 'Remove a copy. The owner only.',
          security: OWNER,
          parameters: [ENTRY, COPY],
          responses: { 200: { description: 'Removed', ...json('Changed') }, ...REFUSALS },
        },
      },
      '/removed/{undo}': {
        post: {
          summary: 'Put a removed game back as it was, within a day. The owner only.',
          security: OWNER,
          parameters: [
            {
              name: 'undo',
              in: 'path',
              required: true,
              description: 'What DELETE /entries/{id} answered with',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Back on the shelf', ...json('Restored') },
            ...REFUSALS,
          },
        },
      },
      '/shelves': {
        get: {
          summary: 'The smart shelves',
          responses: {
            200: { description: 'Every smart shelf, in order', ...json('SmartShelves') },
          },
        },
      },
      '/shelves/{slug}': {
        get: {
          summary: 'One smart shelf. Its games are /library with its query, sort and group.',
          parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'The shelf', ...json('SmartShelf') },
            404: { description: 'No shelf has that slug', ...json('Error') },
          },
        },
        put: {
          summary:
            'Save a smart shelf: the one at this address, or a new one named as asked. The owner only.',
          security: OWNER,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', maxLength: 60 },
                    query: { type: 'string', maxLength: 1000 },
                    sort: { type: 'string' },
                    group: { type: 'string', enum: groupings },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Saved' },
            201: { description: 'Added, at the address in the answer' },
            ...REFUSALS,
          },
        },
        delete: {
          summary: 'Remove a smart shelf. The owner only.',
          security: OWNER,
          responses: { 200: { description: 'Removed' }, ...REFUSALS },
        },
      },
      '/library/snapshot/{version}': {
        get: {
          summary: 'The whole library in one compact file, cached for a year by its version',
          description:
            'What the site itself filters on the device. Its rows are positional; the format is internal and may change. Prefer /library.',
          parameters: [
            { name: 'version', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'The library file' },
            307: { description: 'Sent on to the current version' },
          },
        },
      },
    },
    components: {
      schemas,
      securitySchemes: {
        ownerSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'shelf.session_token',
          description:
            'Set by signing in on the site, with the owner’s email address and password. There is one account, and no way to make another. On HTTPS the cookie is named `__Secure-shelf.session_token`.',
        },
      },
    },
  }
}
