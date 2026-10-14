import 'server-only'

import type { z } from 'zod'

/**
 * How the API answers. Reads change when the library does, so they are kept
 * by the edge for a minute and served stale while a fresh one is made.
 */

const READ_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'

/** A JSON answer, checked against its schema first: the API never sends what it does not describe. */
export const answer = <T extends z.ZodType>(schema: T, body: z.input<T>, status = 200): Response =>
  Response.json(schema.parse(body), {
    status,
    headers: { 'Cache-Control': READ_CACHE, 'Access-Control-Allow-Origin': '*' },
  })

export const failure = (status: number, code: string, message: string): Response =>
  Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  )

/** The query string as one value per name, as a Zod object reads it. */
export const paramsOf = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams)
