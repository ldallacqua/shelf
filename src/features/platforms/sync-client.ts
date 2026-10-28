'use client'

import type { AchievementStep } from '@/domain/achievements/achievements'
import type { Answer } from '@/domain/library/adding'
import type { Format, SyncSource } from '@/domain/library/values'
import type {
  ItemList,
  ItemView,
  LinkPage,
  LinkView,
  NintendoLinkOutcome,
  SyncStep,
} from '@/domain/sync/link'
import { callApi } from '@/features/owner/call-api'

/**
 * The account page's questions about its platforms (ADR 003), through
 * `/api/v1/me/platforms/…`, with the session the browser already has.
 */

export type PlatformRow = { source: SyncSource; ready: boolean; link: LinkView | null }

const base = (source: SyncSource) => `/api/v1/me/platforms/${source}`

export const readPlatforms = (signal?: AbortSignal) =>
  callApi<PlatformRow[]>('GET', '/api/v1/me/platforms', undefined, signal)

/**
 * Where "Sign in through Steam" goes: a plain link, so the browser leaves for
 * Steam and comes back, to the page it left. For Nintendo, the page it opens
 * gives a link to paste.
 */
export const connectAddress = (source: SyncSource, locale: string, page: LinkPage = 'account') =>
  `${base(source)}/connect?locale=${encodeURIComponent(locale)}${page === 'account' ? '' : `&back=${page}`}`

export const syncStep = (source: SyncSource, read: boolean, signal?: AbortSignal) =>
  callApi<SyncStep>('POST', `${base(source)}/sync`, { read }, signal)

/** One step of reading the account's achievements there (issue 72). */
export const achievementStep = (source: SyncSource, signal?: AbortSignal) =>
  callApi<AchievementStep>('POST', `${base(source)}/achievements`, {}, signal)

export const readItems = (source: SyncSource, list: ItemList, signal?: AbortSignal) =>
  callApi<ItemView[]>('GET', `${base(source)}/items?list=${list}`, undefined, signal)

/** The link copied from Nintendo's "Select this account" button, and how linking with it went. */
export const pasteNintendoLink = (link: string) =>
  callApi<{ outcome: NintendoLinkOutcome }>('POST', `${base('nintendo')}/link`, { link })

export type ItemAnswer =
  | { kind: 'pick'; igdbId: number; format?: Format }
  | { kind: 'confirm'; format: Format }
  | { kind: 'dismiss'; as: 'not_a_game' | 'not_mine' }
  | { kind: 'again' }

export const answerItem = (source: SyncSource, id: string, answer: ItemAnswer) =>
  callApi<{ item: ItemView; version: number }>(
    'POST',
    `${base(source)}/items/${encodeURIComponent(id)}`,
    answer,
  )

/** One format for many matched games: the first step of putting them on the shelf. */
export const confirmMany = (source: SyncSource, ids: readonly string[], format: Format) =>
  callApi<SyncStep>('POST', `${base(source)}/answers`, {
    ids,
    answer: { kind: 'confirm', format },
  })

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
