import { describe, expect, it } from 'vitest'

import { handleProblem, isHandle } from './handle'

describe('reserved handles', () => {
  it.each(['shelf', 'savestate', 'save-state'])('keeps %s for the site itself', (handle) => {
    expect(handleProblem(handle)).toBe('reserved')
    expect(isHandle(handle)).toBe(false)
  })

  it('still allows a handle that only starts with one', () => {
    expect(handleProblem('savestates')).toBeUndefined()
  })
})
