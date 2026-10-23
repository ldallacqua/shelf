'use client'

import type { Answer } from '@/domain/library/adding'
import type { SyncSource } from '@/domain/library/values'
import type { ItemList, ItemView, LinkView, SyncStep } from '@/domain/sync/link'
import { callApi } from '@/features/owner/call-api'

/**
 * The account page's questions about its platforms (ADR 003), through
 * `/api/v1/me/platforms/…`, with the session the browser already has.
 */

export type PlatformRow = { source: SyncSource; ready: boolean; link: LinkView | null }

const base = (source: SyncSource) => `/api/v1/me/platforms/${source}`

export const readPlatforms = (signal?: AbortSignal) =>
  callApi<PlatformRow[]>('GET', '/api/v1/me/platforms', undefined, signal)

/** Where "Sign in through Steam" goes: a plain link, so the browser leaves for Steam and comes back. */
export const connectAddress = (source: SyncSource, locale: string) =>
  `${base(source)}/connect?locale=${encodeURIComponent(locale)}`

export const syncStep = (source: SyncSource, read: boolean, signal?: AbortSignal) =>
  callApi<SyncStep>('POST', `${base(source)}/sync`, { read }, signal)

export const readItems = (source: SyncSource, list: ItemList, signal?: AbortSignal) =>
  callApi<ItemView[]>('GET', `${base(source)}/items?list=${list}`, undefined, signal)

export type ItemAnswer =
  | { kind: 'pick'; igdbId: number }
  | { kind: 'dismiss'; as: 'not_a_game' | 'not_mine' }
  | { kind: 'again' }

export const answerItem = (source: SyncSource, id: string, answer: ItemAnswer) =>
  callApi<{ item: ItemView; version: number }>(
    'POST',
    `${base(source)}/items/${encodeURIComponent(id)}`,
    answer,
  )

export const setDaily = (source: SyncSource, daily: boolean) =>
  callApi<LinkView>('PATCH', base(source), { daily })

export const unlink = async (source: SyncSource): Promise<Answer<true>> => {
  try {
    const response = await fetch(base(source), { method: 'DELETE', cache: 'no-store' })
    return response.ok ? { ok: true, value: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** IGDB's games for a title, as the Add sheet finds them. */
export type Found = { igdbId: number; title: string; year: number | null; cover: string | null }

export const searchIgdb = async (text: string, signal?: AbortSignal) => {
  const answer = await callApi<{ results: Found[] }>(
    'GET',
    `/api/v1/igdb/search?q=${encodeURIComponent(text)}`,
    undefined,
    signal,
  )
  return answer.ok ? { ok: true as const, value: answer.value.results } : answer
}
