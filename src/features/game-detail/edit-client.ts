'use client'

import type { EditActions, EditPatch, OwnerGame } from '@/domain/library/editing'
import type { StoreName } from '@/domain/library/stores'
import type { Format, SyncSource } from '@/domain/library/values'
import { callApi as call } from '@/features/owner/call-api'

/**
 * Editing goes through the API, not server actions. A server action that
 * expires the library's cache answers with the current address drawn
 * afresh, and with a game open over the shelf that address is the game's
 * own page, which would take the shelf's place. The API answers with data
 * only, and the page fetches what changed itself.
 */

/** The API takes a rating out of ten and time in hours, as it gives them. */
const toApi = ({ rating, idle, ...rest }: EditPatch) => ({
  ...rest,
  ...(rating === undefined ? {} : { rating: rating === null ? null : rating / 10 }),
  ...(idle === undefined ? {} : { hoursIdle: idle / 60 }),
})

/** What GET /entries/{id} answers, in the API's units. */
type ApiOwnerGame = Omit<OwnerGame, 'rating' | 'tracked' | 'idle' | 'copies'> & {
  rating?: number
  hoursTracked: number
  hoursIdle?: number
  copies: {
    id: string
    platform: number
    format: Format
    stores?: StoreName[]
    synced?: { source: SyncSource; hours: number }[]
  }[]
}

const fromApi = ({
  rating,
  hoursTracked,
  hoursIdle,
  copies,
  ...rest
}: ApiOwnerGame): OwnerGame => ({
  ...rest,
  ...(rating === undefined ? {} : { rating: Math.round(rating * 10) }),
  tracked: Math.round(hoursTracked * 60),
  ...(hoursIdle === undefined ? {} : { idle: Math.round(hoursIdle * 60) }),
  copies: copies.map(({ id, platform, format, stores, synced }) => ({
    id,
    platformId: platform,
    format,
    ...(stores ? { stores } : {}),
    ...(synced
      ? {
          synced: synced.map(({ source, hours }) => ({
            source,
            minutes: Math.round(hours * 60),
          })),
        }
      : {}),
  })),
})

const entry = (entryId: string) => `/api/v1/entries/${encodeURIComponent(entryId)}`

export const editClient: EditActions = {
  read: async (slug) => {
    const answer = await call<ApiOwnerGame>('GET', entry(slug))
    return answer.ok ? { ok: true, value: fromApi(answer.value) } : answer
  },
  update: (entryId, patch) => call('PATCH', entry(entryId), toApi(patch)),
  addCopy: (entryId, copy) =>
    call('POST', `${entry(entryId)}/copies`, {
      platform: copy.platformId,
      format: copy.format,
      ...(copy.stores ? { stores: copy.stores } : {}),
    }),
  setFormat: (entryId, copyId, format) =>
    call('PATCH', `${entry(entryId)}/copies/${encodeURIComponent(copyId)}`, { format }),
  setStores: (entryId, copyId, stores) =>
    call('PATCH', `${entry(entryId)}/copies/${encodeURIComponent(copyId)}`, { stores }),
  removeCopy: (entryId, copyId) =>
    call('DELETE', `${entry(entryId)}/copies/${encodeURIComponent(copyId)}`),
  remove: (entryId) => call('DELETE', entry(entryId)),
  restore: (undo) => call('POST', `/api/v1/removed/${encodeURIComponent(undo)}`),
  archive: (entryId) => call('PUT', `${entry(entryId)}/archived`),
  bringBack: (entryId) => call('DELETE', `${entry(entryId)}/archived`),
  separate: (entryId, gameId) =>
    call('POST', `${entry(entryId)}/versions/${encodeURIComponent(gameId)}/separate`),
  sync: (entryId) => call('POST', `${entry(entryId)}/sync`),
}
