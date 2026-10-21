'use client'

import { refusalReasons, type Answer } from '@/domain/library/adding'

/**
 * One of the owner's requests to Shelf's own API, from the browser, with
 * the session cookie it already has. A refusal comes back as its reason;
 * a request cut short (the page left, the network went, `signal` aborted
 * it) is a failure like any other.
 */
export const callApi = async <T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Answer<T>> => {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
      cache: 'no-store',
    })
    const json: unknown = await response.json().catch(() => undefined)
    if (response.ok) return { ok: true, value: json as T }
    const code = (json as { error?: { code?: string } } | undefined)?.error?.code
    return { ok: false, reason: refusalReasons.find((each) => each === code) ?? 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
