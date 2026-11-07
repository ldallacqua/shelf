import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { callApi } from '@/features/owner/call-api'
import { renderWithIntl } from '@/test/render'

import { setBridgeForTests } from './tauri'
import { ThisComputer } from './this-computer'

/** This computer's name, in Shelf for Windows' Settings (ADR 005, section 12). */

vi.mock('@/features/owner/call-api', () => ({ callApi: vi.fn() }))

const HERE = '5d0c6a3e-2f4b-4c8d-9e1a-7b3f6d2c8a90'

let info: unknown
const app = vi.fn(async (command: string) => (command === 'desktop_info' ? info : undefined))

const devices = (list: unknown[]) =>
  vi
    .mocked(callApi)
    .mockImplementation(async (method: string) =>
      method === 'GET'
        ? { ok: true, value: { devices: list } }
        : { ok: true, value: { version: 9 } },
    )

beforeEach(() => {
  info = { version: '0.11.0', device: HERE }
  vi.mocked(callApi).mockReset()
  setBridgeForTests(app)
})

afterEach(() => setBridgeForTests(undefined))

describe('this computer’s name', () => {
  it('calls an unnamed computer by its place among mine, the next one if it is new', async () => {
    devices([{ id: 'other', number: 1, name: 'Desktop', lastSeenAt: Date.now() }])
    renderWithIntl(<ThisComputer />)
    const field = await screen.findByRole('textbox', { name: 'Name' })
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'Computer 2')
    expect(screen.getByText(/Left empty, it’s called Computer 2/)).toBeInTheDocument()
    expect(screen.getByText('Desktop')).toBeInTheDocument()
  })

  it('saves the name I give it, for my account', async () => {
    devices([{ id: HERE, number: 1 }])
    renderWithIntl(<ThisComputer />)
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), '  Notebook ')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(callApi).toHaveBeenCalledWith('PUT', `/api/v1/me/devices/${HERE}`, { name: 'Notebook' })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Notebook')
  })

  it('takes the name away when the field is emptied', async () => {
    devices([{ id: HERE, number: 1, name: 'Desktop' }])
    renderWithIntl(<ThisComputer />)
    await userEvent.clear(await screen.findByRole('textbox', { name: 'Name' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(callApi).toHaveBeenCalledWith('PUT', `/api/v1/me/devices/${HERE}`, { name: null })
  })

  it('says so when the name could not be saved', async () => {
    devices([])
    renderWithIntl(<ThisComputer />)
    vi.mocked(callApi).mockResolvedValueOnce({ ok: false, reason: 'failed' })
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Desktop')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be saved')
  })

  it('draws nothing in an app too old to say which computer it is', async () => {
    info = { version: '0.10.0' }
    devices([])
    const { container } = renderWithIntl(<ThisComputer />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
