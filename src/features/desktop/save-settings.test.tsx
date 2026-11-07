import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import SaveSettings from './save-settings'
import { setBridgeForTests } from './tauri'

/** The limits on every game's snapshots, in Settings, with the app's commands faked (ADR 008). */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let caps: { mostMb: number; kept: number } | 'old'

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (caps === 'old') throw 'command save_caps not found'
  if (command === 'set_save_caps') {
    // The app keeps them within its bounds, whatever it is asked.
    caps = { mostMb: Number(args?.mostMb), kept: Math.max(3, Number(args?.kept)) }
  }
  return caps
})

beforeEach(() => {
  caps = { mostMb: 500, kept: 20 }
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

describe('the limits on games’ snapshots', () => {
  it('show what the app keeps', async () => {
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByRole('textbox', { name: 'Snapshots kept per game' })).toHaveValue(
      '20',
    )
    expect(screen.getByRole('textbox', { name: 'Largest snapshot' })).toHaveValue('500')
  })

  it('save a change, and say so', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    const kept = await screen.findByRole('textbox', { name: 'Snapshots kept per game' })
    await user.clear(kept)
    await user.type(kept, '30{Enter}')
    await vi.waitFor(() =>
      expect(app).toHaveBeenCalledWith('set_save_caps', { mostMb: 500, kept: 30 }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  })

  it('never ask for fewer than three', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    const kept = await screen.findByRole('textbox', { name: 'Snapshots kept per game' })
    await user.clear(kept)
    await user.type(kept, '1{Enter}')
    await vi.waitFor(() =>
      expect(app).toHaveBeenCalledWith('set_save_caps', { mostMb: 500, kept: 3 }),
    )
  })

  it('ask an app too old to keep saves to be updated', async () => {
    caps = 'old'
    renderWithIntl(<SaveSettings />)
    expect(
      await screen.findByText('Update Shelf for Windows to keep games’ saves.'),
    ).toBeInTheDocument()
  })
})
