import { describe, expect, it, vi } from 'vitest'

import { continueRunWith, type GoingOn } from './admin'

const goingOn = (step: GoingOn['jobs']['step'], answer = new Response(null, { status: 202 })) => {
  const jobs = { step: vi.fn(step), fail: vi.fn(async () => undefined) }
  const send = vi.fn(async () => answer)
  const expire = vi.fn()
  return { jobs, send, expire, password: 'a-made-up-admin-password-for-tests' }
}

describe('a run going on by itself', () => {
  it('asks this server for the next step while there is more, with the password', async () => {
    const deps = goingOn(async () => ({ more: true, libraries: ['library-1'] }))
    await continueRunWith(deps, 'run-1', 'https://shelf.test')
    expect(deps.expire).toHaveBeenCalledWith('library-1')
    expect(deps.send).toHaveBeenCalledWith(
      'https://shelf.test/api/admin/runs/run-1/step',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer a-made-up-admin-password-for-tests' },
      }),
    )
    expect(deps.jobs.fail).not.toHaveBeenCalled()
  })

  it('asks for nothing once the run is done', async () => {
    const deps = goingOn(async () => ({ more: false, libraries: [] }))
    await continueRunWith(deps, 'run-1', 'https://shelf.test')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('fails the run, in words, when the next step is refused or a step throws', async () => {
    const refused = goingOn(
      async () => ({ more: true, libraries: [] }),
      new Response(null, { status: 401 }),
    )
    await continueRunWith(refused, 'run-1', 'https://shelf.test')
    expect(refused.jobs.fail).toHaveBeenCalledWith('run-1', 'The next step was refused (401).')

    const thrown = goingOn(async () => {
      throw new Error('The database is gone.')
    })
    await continueRunWith(thrown, 'run-2', 'https://shelf.test')
    expect(thrown.jobs.fail).toHaveBeenCalledWith('run-2', 'The database is gone.')
    expect(thrown.send).not.toHaveBeenCalled()
  })
})
