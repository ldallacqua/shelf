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

const foundSchema = z.object({
  source: z.string(),
  sourceName: z.string(),
  place: z.number(),
  title: z.string(),
  fileSize: z.string().nullable(),
  uploadDate: z.string().nullable(),
  web: z.number(),
  magnets: z.number(),
  inParts: z.boolean(),
})

/** One download a search found, and what a person chooses by. Never its links. */
export type Found = z.infer<typeof foundSchema>

const downloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceName: z.string(),
  file: z.string().nullable(),
  folder: z.string(),
  state: z.enum(['queued', 'remote', 'downloading', 'paused', 'failed', 'done']),
  why: z
    .enum([
      'page',
      'unreachable',
      'disk',
      'write',
      'signedout',
      'premium',
      'blocked',
      'dead',
      'virus',
      'host',
      'busy',
      'declined',
    ])
    .nullable(),
  done: z.number(),
  total: z.number().nullable(),
  speed: z.number(),
  through: z.enum(['direct', 'realdebrid']),
  remote: z.number().nullable(),
})

export type Download = z.infer<typeof downloadSchema>

const accountSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('out') }),
  z.object({ state: z.literal('waiting'), code: z.string(), url: z.string() }),
  z.object({
    state: z.literal('in'),
    username: z.string(),
    premium: z.boolean(),
    until: z.string().nullable(),
  }),
])

/** All a page is told about Real-Debrid: never what a sign-in gives. */
export type RealDebridAccount = z.infer<typeof accountSchema>

export const realDebrid = {
  account: async (): Promise<RealDebridAccount> =>
    accountSchema.parse(await call('real_debrid_account')),
  /** Asks for a code to enter on Real-Debrid's own page. */
  signIn: async (): Promise<RealDebridAccount> =>
    accountSchema.parse(await call('real_debrid_sign_in')),
  cancelSignIn: async (): Promise<void> => {
    await call('real_debrid_cancel_sign_in')
  },
  signOut: async (): Promise<void> => {
    await call('real_debrid_sign_out')
  },
}

/** What the app is downloading (`desktop/src/downloads.rs`). A page names, and never hands it a link. */
export const downloads = {
  list: async (): Promise<Download[]> => z.array(downloadSchema).parse(await call('downloads_now')),
  /**
   * Asks Windows for a folder, titled `ask`, then puts this one in line. False when the picker is
   * closed. Named by its place and what was shown there, so a list since changed starts nothing.
   */
  start: async (found: Found, ask: string, through: Download['through']): Promise<boolean> =>
    z.boolean().parse(
      await call('start_download', {
        source: found.source,
        place: found.place,
        title: found.title,
        ask,
        through,
      }),
    ),
  pause: async (id: string): Promise<void> => {
    await call('pause_download', { id })
  },
  resume: async (id: string): Promise<void> => {
    await call('resume_download', { id })
  },
  /** Off the list. Unfinished, what it had goes too; finished, the file stays. */
  remove: async (id: string): Promise<void> => {
    await call('remove_download', { id })
  },
  /** Explorer, at a finished file. Showing it, never opening it. */
  show: async (id: string): Promise<void> => {
    await call('show_download', { id })
  },
}

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
  /** Every download whose title has all these words. */
  search: async (words: string): Promise<Found[]> =>
    z.array(foundSchema).parse(await call('search_sources', { words })),
}
