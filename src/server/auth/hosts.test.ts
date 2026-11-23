import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FORMER_PRODUCTION_HOSTS, ownHosts } from '@/server/auth/hosts'

const NAMES = [
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_URL',
]

const onVercel = (env: 'production' | 'preview', productionHost: string) => {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_ENV', env)
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', productionHost)
  vi.stubEnv('VERCEL_BRANCH_URL', 'shelf-ldallacqua-git-main-dallacqua.vercel.app')
  vi.stubEnv('VERCEL_URL', 'shelf-ldallacqua-a1b2c3-dallacqua.vercel.app')
}

beforeEach(() => {
  for (const name of NAMES) vi.stubEnv(name, '')
  // Unset, not empty: the local server's port falls back to Shelf's own.
  vi.stubEnv('PORT', undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('ownHosts', () => {
  it('keeps the former address in production once the domain is production', () => {
    onVercel('production', 'savestate.gg')
    expect(ownHosts()).toEqual([
      'savestate.gg',
      'shelf-ldallacqua-git-main-dallacqua.vercel.app',
      'shelf-ldallacqua-a1b2c3-dallacqua.vercel.app',
      'shelf-ldallacqua.vercel.app',
    ])
  })

  it('names the former address once while it is still production', () => {
    onVercel('production', 'shelf-ldallacqua.vercel.app')
    const hosts = ownHosts()
    expect(hosts.filter((host) => host === 'shelf-ldallacqua.vercel.app')).toHaveLength(1)
  })

  it('gives a preview no former address, which never leads to one', () => {
    onVercel('preview', 'savestate.gg')
    expect(ownHosts()).not.toContain('shelf-ldallacqua.vercel.app')
    expect(ownHosts()).toContain('shelf-ldallacqua-a1b2c3-dallacqua.vercel.app')
  })

  it('is the local server off Vercel, without the former address', () => {
    expect(ownHosts()).toEqual(['localhost:3300'])
    vi.stubEnv('PORT', '4000')
    expect(ownHosts()).toEqual(['localhost:4000'])
  })

  it('names hosts only, as Better Auth matches them', () => {
    for (const host of FORMER_PRODUCTION_HOSTS) {
      expect(host).toMatch(/^[a-z0-9.-]+$/)
    }
  })
})
