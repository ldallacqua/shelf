import { describe, expect, it } from 'vitest'

import { isProduction } from './production.ts'

describe('isProduction', () => {
  it('knows the domain, its www and the former address', () => {
    expect(isProduction('https://savestate.gg')).toBe(true)
    expect(isProduction('https://www.savestate.gg/en')).toBe(true)
    expect(isProduction('https://shelf-ldallacqua.vercel.app')).toBe(true)
  })

  it('knows them in any case, scheme or port, and fully qualified', () => {
    expect(isProduction('HTTPS://SaveState.GG/')).toBe(true)
    expect(isProduction('http://savestate.gg:8080')).toBe(true)
    expect(isProduction('https://savestate.gg./en')).toBe(true)
  })

  it('lets the local server, a preview and lookalikes through', () => {
    expect(isProduction('http://localhost:3300')).toBe(false)
    expect(isProduction('https://shelf-ldallacqua-git-main-dallacqua.vercel.app')).toBe(false)
    expect(isProduction('https://savestate.gg.example.com')).toBe(false)
    expect(isProduction('https://preview.savestate.gg')).toBe(false)
  })

  it('is not production when it is no address at all', () => {
    expect(isProduction('savestate')).toBe(false)
  })
})
