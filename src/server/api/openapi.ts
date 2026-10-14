import 'server-only'

import { z } from 'zod'

import { sortKeys } from '@/domain/library/sort'
import { groupings } from '@/domain/library/group'
import { siteUrl } from '@/server/site-url'

import {
  apiError,
  apiGame,
  apiShelf,
  facetsAnswer,
  libraryAnswer,
  shelfOutline,
  shelvesAnswer,
} from './library'

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

export const openApiDocument = () => {
  // Every schema with an id becomes a component; a schema inside another is a reference to it.
  const registry = z.registry<{ id: string }>()
  for (const schema of [
    libraryAnswer,
    facetsAnswer,
    shelvesAnswer,
    apiShelf,
    apiGame,
    shelfOutline,
    apiError,
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
        'A personal game library. Everything here is public and read-only; changes need the owner, and arrive with sign-in.',
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
    components: { schemas },
  }
}
