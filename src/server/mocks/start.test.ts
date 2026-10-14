import { afterEach, describe, expect, it, vi } from 'vitest'

import { startMocks } from '@/server/mocks/start'

afterEach(() => vi.unstubAllEnvs())

describe('startMocks', () => {
  it('refuses to start on Vercel, whatever the settings say', () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('SHELF_MOCKS', '1')
    expect(() => startMocks()).toThrow(/refuse to start/)
  })
})
