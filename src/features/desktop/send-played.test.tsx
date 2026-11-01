import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { callApi } from '@/features/owner/call-api'

import { startSendingPlayed } from './send-played'
import { setBridgeForTests } from './tauri'

/** What Shelf for Windows counted, on its way to Shelf (ADR 005, section 12). */

vi.mock('@/features/owner/call-api', () => ({ callApi: vi.fn() }))

const SESSION = {
  id: '3f2b8c1e-6a4d-4e7b-9c10-2d5e8f7a1b3c',
  game: { steam: '620' },
  startedAt: 1,
  endedAt: 2,
  seconds: 60,
}
const OTHER = { ...SESSION, id: '7a1d9e2c-4b6f-4a3e-8d21-5c9e0f3b7a64', game: { steam: '999' } }

let sessions: (typeof SESSION)[]
let kept: string[][]
let stop: (() => void) | undefined

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (command === 'play_sessions') return sessions
  if (command === 'play_sessions_kept') kept.push(args?.ids as string[])
  return undefined
})

beforeEach(() => {
  sessions = [SESSION, OTHER]
  kept = []
  app.mockClear()
  vi.mocked(callApi).mockReset()
  setBridgeForTests(app)
})

afterEach(() => {
  stop?.()
  setBridgeForTests(undefined)
})

describe('sending what the app counted', () => {
  it('sends what has ended, and has the app let go of only what Shelf kept', async () => {
    vi.mocked(callApi).mockResolvedValue({ ok: true, value: { kept: [SESSION.id], version: 3 } })
    stop = startSendingPlayed()
    await vi.waitFor(() => expect(kept).toEqual([[SESSION.id]]))
    expect(callApi).toHaveBeenCalledWith('POST', '/api/v1/me/play/sessions', {
      sessions: [SESSION, OTHER],
    })
  })

  it('holds on to everything when Shelf refuses, for the next try', async () => {
    vi.mocked(callApi).mockResolvedValue({ ok: false, reason: 'not-signed-in' })
    stop = startSendingPlayed()
    await vi.waitFor(() => expect(callApi).toHaveBeenCalled())
    await new Promise((done) => setTimeout(done))
    expect(kept).toEqual([])
  })

  it('asks Shelf nothing with nothing to send', async () => {
    sessions = []
    stop = startSendingPlayed()
    await vi.waitFor(() => expect(app).toHaveBeenCalled())
    await new Promise((done) => setTimeout(done))
    expect(callApi).not.toHaveBeenCalled()
  })

  it('asks again when the window comes back', async () => {
    sessions = []
    stop = startSendingPlayed()
    await vi.waitFor(() => expect(app).toHaveBeenCalledTimes(1))
    await new Promise((done) => setTimeout(done))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(app).toHaveBeenCalledTimes(2))
  })

  it('does nothing in an app older than the command', async () => {
    setBridgeForTests(async () => {
      throw 'failed'
    })
    stop = startSendingPlayed()
    await new Promise((done) => setTimeout(done))
    expect(callApi).not.toHaveBeenCalled()
  })
})
