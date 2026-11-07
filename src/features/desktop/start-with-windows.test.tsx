import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { StartWithWindows } from './start-with-windows'
import { setBridgeForTests } from './tauri'

/** Starting with Windows, on Settings' App page (issue 152), beside the tray's own check. */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const LABEL = 'Start Shelf for Windows in the tray when Windows starts'

let starting = { available: true, on: true }
let refuse: string | undefined
const app = vi.fn(async (command: string, args?: { on?: boolean }) => {
  if (refuse) throw refuse
  if (command === 'set_start_with_windows') starting = { ...starting, on: Boolean(args?.on) }
  return starting
})

beforeEach(() => {
  starting = { available: true, on: true }
  refuse = undefined
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => setBridgeForTests(undefined))

describe('starting with Windows', () => {
  it('shows what the app says, and changes it there', async () => {
    renderWithIntl(<StartWithWindows />)
    const toggle = await screen.findByRole('switch', { name: LABEL })
    expect(toggle).toBeChecked()
    expect(screen.getByText('This device')).toBeInTheDocument()

    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(app).toHaveBeenCalledWith('set_start_with_windows', { on: false })
  })

  it('links to how hours are counted', async () => {
    renderWithIntl(<StartWithWindows />)
    expect(await screen.findByRole('link', { name: 'How hours are counted' })).toHaveAttribute(
      'href',
      '/en#faq-hours',
    )
  })

  it('offers no change a development build could not make', async () => {
    starting = { available: false, on: false }
    renderWithIntl(<StartWithWindows />)
    expect(await screen.findByRole('switch', { name: LABEL })).toBeDisabled()
    expect(
      screen.getByText('Only an installed Shelf for Windows can start with Windows.'),
    ).toBeInTheDocument()
  })

  it('sends an app older than the command to the tray', async () => {
    refuse = 'Command start_with_windows not found'
    renderWithIntl(<StartWithWindows />, 'pt-BR')
    expect(await screen.findByText(/Atualize o Shelf para Windows/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('says so when Windows does not take the change, and keeps what was', async () => {
    renderWithIntl(<StartWithWindows />)
    const toggle = await screen.findByRole('switch', { name: LABEL })
    refuse = 'failed'
    await userEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Windows did not take the change.')
    expect(toggle).toBeChecked()
  })
})
