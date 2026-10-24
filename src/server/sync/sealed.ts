import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import type { SyncSource } from '@/domain/library/values'
import { platformTokenKey } from '@/server/env'
import { SourceError } from '@/server/sync/source-error'

/**
 * What a platform's sign-in gives Shelf to keep, sealed (ADR 003, "Built:
 * Nintendo"): AES-256-GCM with this server's key, bound to the account and
 * the source it was given for, so a sealed token copied to another link
 * opens nowhere. Only the sync opens it, to ask the platform; it is never
 * sent to a browser, logged or shown.
 */

const VERSION = 'v1'
const IV_BYTES = 12

const boundTo = (userId: string, source: SyncSource) => Buffer.from(`${userId}:${source}`)

const keyOrRefuse = (): Buffer => {
  const key = platformTokenKey()
  if (!key) throw new SourceError('unset', 'This server has no key to seal platform tokens with.')
  return key
}

/** Whether this server can seal and open tokens at all. */
export const canSeal = (): boolean => platformTokenKey() !== undefined

export const seal = (secret: string, userId: string, source: SyncSource): string => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyOrRefuse(), iv)
  cipher.setAAD(boundTo(userId, source))
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [VERSION, iv, body, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

/**
 * The secret a sealed value holds, for this account and source. Undefined
 * when it cannot be opened: sealed with another key, for another link, or
 * changed. The link then has to be made again.
 */
export const open = (sealed: string, userId: string, source: SyncSource): string | undefined => {
  const [version, iv, body, tag] = sealed.split('.')
  if (version !== VERSION || !iv || !body || !tag) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOrRefuse(), Buffer.from(iv, 'base64url'))
    decipher.setAAD(boundTo(userId, source))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch (error) {
    if (error instanceof SourceError) throw error
    return undefined
  }
}
