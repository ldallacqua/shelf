'use client'

import { imageIdOf, imageSizes } from '@/domain/igdb/images'
import type { Added, Answer, Candidate, Refusal } from '@/domain/library/adding'
import type { Confidence, MatchAnswer } from '@/domain/library/bulk'
import type { Format, Kind, Status } from '@/domain/library/values'
import { callApi } from '@/features/owner/call-api'

/**
 * The "Paste a list" tab's requests (spec 4.2), through the API: matching
 * can be canceled mid-request, and adding many games does not draw the
 * page again after every few of them.
 */

type ApiCandidate = {
  igdbId: number
  slug: string
  title: string
  year: number | null
  kind: Kind
  cover: string | null
  platforms: number[]
  alsoOn: number[]
  onShelf: { slug: string; title: string; archived?: string } | null
}

type ApiListMatch = {
  lines: {
    text: string
    title: string
    year: number | null
    platform: string | null
    platformId: number | null
    confidence: Confidence
    candidates: ApiCandidate[]
  }[]
  platforms: MatchAnswer['platforms']
  habits: MatchAnswer['habits']
}

const COVER = imageSizes.cover_big

const toCandidate = ({ year, cover, onShelf, ...rest }: ApiCandidate): Candidate => {
  const id = cover ? imageIdOf(cover) : undefined
  return {
    ...rest,
    ports: [],
    ...(year === null ? {} : { year }),
    ...(id ? { cover: { id, width: COVER.width, height: COVER.height } } : {}),
    ...(onShelf ? { onShelf } : {}),
  }
}

/** Lines matched against IGDB. Aborting `signal` cancels the request. */
export const matchLines = async (
  lines: readonly string[],
  signal?: AbortSignal,
): Promise<Answer<MatchAnswer>> => {
  const answer = await callApi<ApiListMatch>('POST', '/api/v1/igdb/match', { lines }, signal)
  if (!answer.ok) return answer
  return {
    ok: true,
    value: {
      lines: answer.value.lines.map(({ year, platform, platformId, candidates, ...line }) => ({
        ...line,
        ...(year === null ? {} : { year }),
        ...(platform === null ? {} : { platform }),
        ...(platformId === null ? {} : { platformId }),
        candidates: candidates.map(toCandidate),
      })),
      platforms: answer.value.platforms,
      habits: answer.value.habits,
    },
  }
}

export type NewGame = {
  igdbId: number
  status: Status
  copies: { platform: number; format: Format }[]
}

export type Addition =
  | { added: true; slug: string; title: string; undo: Added }
  | { added: false; error: Refusal['reason'] }

/** Games added at once, each with its own result. */
export const addGames = (games: readonly NewGame[]) =>
  callApi<{ results: Addition[]; version: number }>('POST', '/api/v1/additions', { games })

/** What `addGames` added, taken back. */
export const undoGames = (undo: readonly Added[]) =>
  callApi<{ version: number }>('POST', '/api/v1/additions/undo', { undo })
