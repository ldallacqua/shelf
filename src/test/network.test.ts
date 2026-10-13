import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { network } from '@/test/network'

describe('the test network', () => {
  it('refuses a request nothing answers for, instead of sending it', async () => {
    await expect(fetch('https://api.igdb.com/v4/games', { method: 'POST' })).rejects.toThrow()
    await expect(fetch('https://example.com/')).rejects.toThrow()
  })

  it('answers a request a test has a double for', async () => {
    network.use(http.get('https://example.com/hello', () => HttpResponse.json({ hello: 'there' })))
    const response = await fetch('https://example.com/hello')
    expect(await response.json()).toEqual({ hello: 'there' })
  })

  it('forgets a double when the test that added it ends', async () => {
    await expect(fetch('https://example.com/hello')).rejects.toThrow()
  })
})
