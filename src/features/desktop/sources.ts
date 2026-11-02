import { z } from 'zod'

import { call } from './tauri'

/**
 * Download sources, as Shelf for Windows keeps them on this computer (ADR 007). A page is told what
 * a source is and how many it lists, never its links. Apart from `bridge.ts`, so the game's page
 * doesn't carry it, and only the account page's section, fetched in the app alone, imports it.
 */

const sourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  addedAt: z.number(),
  readAt: z.number(),
  items: z.number(),
  magnets: z.number(),
  web: z.number(),
  leftOut: z.number(),
})

export type Source = z.infer<typeof sourceSchema>

/** Why the app did nothing (`desktop/src/sources.rs`). */
export const sourceRefusals = [
  'invalid',
  'duplicate',
  'unreachable',
  'large',
  'unsupported',
  'missing',
  'failed',
] as const
export type SourceRefusal = (typeof sourceRefusals)[number]

/** A command's refusal as a word; anything else it throws is `failed`. */
export const sourceRefusalOf = (error: unknown): SourceRefusal =>
  sourceRefusals.find((refusal) => refusal === error) ?? 'failed'

export const sources = {
  list: async (): Promise<Source[]> => z.array(sourceSchema).parse(await call('download_sources')),
  /** Reads the source at an address, and keeps it. Nothing is downloaded. */
  add: async (url: string): Promise<Source> =>
    sourceSchema.parse(await call('add_source', { url })),
  /** Reads a source again. If that fails, the list it has stays. */
  readAgain: async (id: string): Promise<Source> =>
    sourceSchema.parse(await call('read_source_again', { id })),
  remove: async (id: string): Promise<void> => {
    await call('remove_source', { id })
  },
}
