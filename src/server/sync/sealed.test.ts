import { afterEach, describe, expect, it, vi } from 'vitest'

import { open, seal } from '@/server/sync/sealed'
import { SourceError } from '@/server/sync/source-error'

const KEY = Buffer.alloc(32, 7).toString('base64')

afterEach(() => vi.unstubAllEnvs())

describe('a sealed platform token', () => {
  it('opens for the account and source it was sealed for, and holds nothing readable', () => {
    vi.stubEnv('PLATFORM_TOKEN_KEY', KEY)
    const sealed = seal('session-token-value', 'user-1', 'nintendo')
    expect(sealed).not.toContain('session-token-value')
    expect(open(sealed, 'user-1', 'nintendo')).toBe('session-token-value')
  })

  it('opens for no other account or source, nor once changed', () => {
    vi.stubEnv('PLATFORM_TOKEN_KEY', KEY)
    const sealed = seal('session-token-value', 'user-1', 'nintendo')
    expect(open(sealed, 'user-2', 'nintendo')).toBeUndefined()
    expect(open(sealed, 'user-1', 'steam')).toBeUndefined()
    const [version, iv, body, tag] = sealed.split('.')
    const changed = [version, iv, `${body!.slice(0, -2)}AA`, tag].join('.')
    expect(open(changed, 'user-1', 'nintendo')).toBeUndefined()
    expect(open('not sealed', 'user-1', 'nintendo')).toBeUndefined()
  })

  it('opens under no other key', () => {
    vi.stubEnv('PLATFORM_TOKEN_KEY', KEY)
    const sealed = seal('session-token-value', 'user-1', 'nintendo')
    vi.stubEnv('PLATFORM_TOKEN_KEY', Buffer.alloc(32, 9).toString('base64'))
    expect(open(sealed, 'user-1', 'nintendo')).toBeUndefined()
  })

  it('says this server is not set up for it without a key of 32 bytes', () => {
    vi.stubEnv('PLATFORM_TOKEN_KEY', Buffer.alloc(16, 7).toString('base64'))
    expect(() => seal('session-token-value', 'user-1', 'nintendo')).toThrow(SourceError)
  })
})
