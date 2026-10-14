import 'server-only'

import type { z } from 'zod'

import { twitchTokenSchema } from '@/domain/igdb/schema'

/**
 * The one piece of code that talks to IGDB. It owns the three things every
 * caller would otherwise get wrong separately: the Twitch token, IGDB's rate
 * limit, and checking that what came back has the expected shape.
 *
 * It takes its clock, its `fetch` and its token storage as arguments, so the
 * tests run it against a fake IGDB with no waiting and no network.
 */

export const IGDB_API = 'https://api.igdb.com/v4'
export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

export type StoredToken = { accessToken: string; expiresAt: number }

export type TokenStore = {
  read: () => Promise<StoredToken | undefined>
  write: (token: StoredToken) => Promise<void>
}

export type IgdbErrorCode =
  /** IGDB or Twitch could not be reached, or answered with a server error. */
  | 'unavailable'
  /** Still rate-limited after waiting and retrying. */
  | 'rate-limited'
  /** Twitch refused the application's credentials. */
  | 'unauthorized'
  /** The answer was not what IGDB documents. */
  | 'bad-response'
  /** IGDB rejected the query itself. */
  | 'bad-query'

export class IgdbError extends Error {
  readonly code: IgdbErrorCode
  readonly status?: number

  constructor(code: IgdbErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'IgdbError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}

export type IgdbClientOptions = {
  credentials: () => { clientId: string; clientSecret: string }
  tokens: TokenStore
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Requests started per second. IGDB allows 4. */
  perSecond?: number
  /** Requests open at once. IGDB allows 8; 4 leaves room for another server instance. */
  maxInFlight?: number
  /** How many times a rate-limited or failed request is tried again. */
  retries?: number
  /** Gives up on a request after this long. */
  timeoutMs?: number
  warn?: (message: string) => void
}

/** A token this close to expiring is replaced before it is used. */
const RENEW_AHEAD_MS = 24 * 60 * 60 * 1000

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type IgdbClient = ReturnType<typeof createIgdbClient>

export const createIgdbClient = (options: IgdbClientOptions) => {
  // Looked up on every call, never captured: test doubles replace the global
  // `fetch` after this client may already exist.
  const fetcher: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init)
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  const interval = 1000 / (options.perSecond ?? 4)
  const maxInFlight = options.maxInFlight ?? 4
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 15_000
  const warn = options.warn ?? ((message: string) => console.warn(message))

  let current: StoredToken | undefined
  let renewing: Promise<StoredToken> | undefined

  const renew = async (): Promise<StoredToken> => {
    const { clientId, clientSecret } = options.credentials()
    let response: Response
    try {
      // The secret travels in the body, never in the address, so it cannot end up in a log.
      response = await fetcher(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new IgdbError('unavailable', 'Twitch could not be reached for a token')
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new IgdbError(
        'unauthorized',
        'Twitch refused the application credentials',
        response.status,
      )
    }
    if (!response.ok) {
      throw new IgdbError('unavailable', 'Twitch did not issue a token', response.status)
    }
    const parsed = twitchTokenSchema.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) {
      throw new IgdbError('bad-response', 'Twitch sent a token answer that could not be read')
    }
    const token = {
      accessToken: parsed.data.access_token,
      expiresAt: now() + parsed.data.expires_in * 1000,
    }
    current = token
    await options.tokens.write(token)
    return token
  }

  /**
   * The token to use. `rejected` is a token IGDB just refused: if it is still
   * the current one it is replaced, and if another caller already replaced
   * it, theirs is used. Concurrent callers share one request to Twitch.
   */
  const token = async (rejected?: string): Promise<string> => {
    current ??= await options.tokens.read()
    const usable =
      current && current.accessToken !== rejected && current.expiresAt - now() > RENEW_AHEAD_MS
    if (usable && current) return current.accessToken
    renewing ??= renew().finally(() => {
      renewing = undefined
    })
    return (await renewing).accessToken
  }

  let nextSlot = 0
  let inFlight = 0
  const queue: (() => void)[] = []

  /**
   * Runs a request inside IGDB's limits. Each call takes the next free start
   * time before it waits for anything, so any number of concurrent callers
   * share one ceiling.
   */
  const schedule = async <T>(run: () => Promise<T>): Promise<T> => {
    const start = Math.max(now(), nextSlot)
    nextSlot = start + interval
    const wait = start - now()
    if (wait > 0) await sleep(wait)
    if (inFlight >= maxInFlight) await new Promise<void>((resolve) => queue.push(resolve))
    inFlight += 1
    try {
      return await run()
    } finally {
      inFlight -= 1
      queue.shift()?.()
    }
  }

  const retryDelay = (response: Response | undefined, attempt: number): number => {
    const header = Number(response?.headers.get('retry-after'))
    if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 10_000)
    // 0.5 s, 1 s, 2 s, with a little randomness so parallel callers do not retry together.
    return 500 * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5)
  }

  /** Sends one query and returns IGDB's JSON, retrying what is worth retrying. */
  const post = async (endpoint: string, body: string): Promise<unknown> => {
    const { clientId } = options.credentials()
    let attempt = 0
    let rejected: string | undefined
    let renewed = false

    for (;;) {
      const accessToken = await token(rejected)
      let response: Response | undefined
      try {
        response = await schedule(() =>
          fetcher(`${IGDB_API}/${endpoint}`, {
            method: 'POST',
            headers: {
              'Client-ID': clientId,
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Content-Type': 'text/plain',
            },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          }),
        )
      } catch {
        response = undefined
      }

      if (response?.ok) {
        try {
          return await response.json()
        } catch {
          throw new IgdbError('bad-response', `IGDB sent ${endpoint} an answer that is not JSON`)
        }
      }

      if (response?.status === 401 && !renewed) {
        // The stored token was revoked or expired early: get a new one, once.
        renewed = true
        rejected = accessToken
        continue
      }

      const worthRetrying = !response || response.status === 429 || response.status >= 500
      if (worthRetrying && attempt < retries) {
        attempt += 1
        await sleep(retryDelay(response, attempt))
        continue
      }

      if (!response) throw new IgdbError('unavailable', 'IGDB could not be reached')
      if (response.status === 429) {
        throw new IgdbError('rate-limited', 'IGDB is still rate-limiting after retries', 429)
      }
      if (response.status === 401 || response.status === 403) {
        throw new IgdbError('unauthorized', 'IGDB refused the token', response.status)
      }
      if (response.status >= 500) {
        throw new IgdbError('unavailable', 'IGDB answered with a server error', response.status)
      }
      throw new IgdbError('bad-query', `IGDB rejected the ${endpoint} query`, response.status)
    }
  }

  const describe = (value: unknown): string =>
    typeof value === 'object' && value !== null && 'id' in value
      ? `id ${String((value as { id: unknown }).id)}`
      : 'no id'

  const parseAll = <Schema extends z.ZodType>(
    endpoint: string,
    data: unknown,
    schema: Schema,
  ): z.output<Schema>[] => {
    if (!Array.isArray(data)) {
      throw new IgdbError('bad-response', `IGDB sent ${endpoint} something that is not a list`)
    }
    const records: z.output<Schema>[] = []
    for (const item of data) {
      const parsed = schema.safeParse(item)
      if (parsed.success) {
        records.push(parsed.data)
      } else {
        // Skipped whole, never half-stored. The message names fields, never content.
        const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
        warn(`IGDB ${endpoint}: skipped a record (${describe(item)}); bad ${fields.join(', ')}`)
      }
    }
    return records
  }

  /** One query, checked record by record against a schema. */
  const query = async <Schema extends z.ZodType>(
    endpoint: string,
    body: string,
    schema: Schema,
  ): Promise<z.output<Schema>[]> => parseAll(endpoint, await post(endpoint, body), schema)

  /**
   * Up to ten queries in one request. Returns one list per query, in order.
   * IGDB's `search` returns nothing inside a multi-query; match by name there.
   */
  const multi = async <Schema extends z.ZodType>(
    queries: readonly { endpoint: string; body: string }[],
    schema: Schema,
  ): Promise<z.output<Schema>[][]> => {
    if (queries.length === 0) return []
    if (queries.length > 10) throw new Error('IGDB takes at most 10 queries in one request')
    const body = queries
      .map((item, index) => `query ${item.endpoint} "q${index}" { ${item.body} };`)
      .join('\n')
    const data = await post('multiquery', body)
    if (!Array.isArray(data)) {
      throw new IgdbError('bad-response', 'IGDB sent multiquery something that is not a list')
    }
    const byName = new Map<string, unknown>()
    for (const item of data) {
      if (typeof item === 'object' && item !== null && 'name' in item) {
        byName.set(String((item as { name: unknown }).name), (item as { result?: unknown }).result)
      }
    }
    return queries.map((item, index) =>
      parseAll(item.endpoint, byName.get(`q${index}`) ?? [], schema),
    )
  }

  return { query, multi }
}

/** Keeps the token only for the life of the process. For scripts and tests. */
export const memoryTokenStore = (initial?: StoredToken): TokenStore => {
  let stored = initial
  return {
    read: async () => stored,
    write: async (token) => {
      stored = token
    },
  }
}
