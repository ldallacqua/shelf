import { describe, expect, it } from 'vitest'

import { isKnownPath } from './known-paths'
import { movedTo } from './moved'

describe('pages that moved (issue 152)', () => {
  it('sends the account page to Profile, and its Settings tab to every setting', () => {
    expect(movedTo('/account', new URLSearchParams())).toBe('/settings/profile')
    expect(movedTo('/account/settings', new URLSearchParams())).toBe('/settings')
  })

  it('sends a return from linking Steam to Platforms', () => {
    expect(movedTo('/account', new URLSearchParams('steam=linked'))).toBe('/settings/platforms')
  })

  it('moves only those two, and each to a page that exists', () => {
    for (const rest of ['/account/unsorted', '/account/start', '/settings', '/u/sample']) {
      expect(movedTo(rest, new URLSearchParams())).toBeUndefined()
    }
    for (const rest of ['/account', '/account/settings']) {
      expect(isKnownPath(rest)).toBe(false)
      expect(isKnownPath(movedTo(rest, new URLSearchParams('steam=failed'))!)).toBe(true)
      expect(isKnownPath(movedTo(rest, new URLSearchParams())!)).toBe(true)
    }
  })
})
