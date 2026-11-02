import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import DownloadsLink, { DownloadsLinkView, shareOf } from './downloads-link'
import type { Download } from './sources'
import { setBridgeForTests } from './tauri'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** The way to the downloads, in the header, with the app's commands faked (ADR 007). */

const DOWNLOAD: Download = {
  id: 'one',
  entry: null,
  title: 'Made-up Game',
  sourceName: 'Made-up source',
  file: 'made-up.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 25,
  total: 100,
  speed: 10,
  through: 'direct',
  remote: null,
  archives: 0,
  extraction: null,
}
const FINISHED: Download = { ...DOWNLOAD, state: 'done', done: 100, speed: 0 }

let kept: Download[]
let sources: unknown[]

const app = vi.fn(async (command: string) => {
  if (command === 'downloads_now') return kept
  if (command === 'download_sources') return sources
  return undefined
})

beforeEach(() => {
  kept = []
  sources = []
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

describe('the way to the downloads', () => {
  it('draws nothing for someone with no source and no download', async () => {
    const { container } = renderWithIntl(<DownloadsLink />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('download_sources', {}))
    expect(container).toBeEmptyDOMElement()
  })

  it('is there once there is a source, with nothing moving', async () => {
    sources = [
      {
        id: 'one',
        name: 'Made-up source',
        url: 'https://files.example.invalid/source.json',
        addedAt: 1,
        readAt: 1,
        items: 1,
        magnets: 1,
        web: 0,
        leftOut: 0,
      },
    ]
    renderWithIntl(<DownloadsLink />)
    expect(await screen.findByRole('link', { name: 'Downloads' })).toHaveAttribute(
      'href',
      '/en/downloads',
    )
  })

  it('says how far along what is moving is', () => {
    renderWithIntl(<DownloadsLinkView list={[DOWNLOAD]} />)
    expect(screen.getByRole('link', { name: 'Downloads: 25%' })).toBeInTheDocument()
  })

  it('says only that it is moving when that can’t be told', () => {
    renderWithIntl(<DownloadsLinkView list={[{ ...DOWNLOAD, total: null }]} />)
    expect(screen.getByRole('link', { name: 'Downloads: under way' })).toBeInTheDocument()
  })

  it('says when one has stopped, as that is mine to do something about', () => {
    renderWithIntl(<DownloadsLinkView list={[{ ...DOWNLOAD, state: 'failed', why: 'disk' }]} />)
    expect(screen.getByRole('link', { name: 'Downloads: one has stopped' })).toBeInTheDocument()
  })

  it('counts an extraction as moving, and what is finished not at all', () => {
    expect(shareOf([FINISHED])).toBeUndefined()
    expect(
      shareOf([
        FINISHED,
        {
          ...FINISHED,
          id: 'two',
          archives: 1,
          extraction: { state: 'working', why: null, done: 1, total: 4 },
        },
      ]),
    ).toBe(0.25)
    expect(
      shareOf([{ ...FINISHED, extraction: { state: 'working', why: null, done: 0, total: 0 } }]),
    ).toBeUndefined()
  })

  it('adds up what is moving', () => {
    expect(shareOf([DOWNLOAD, { ...DOWNLOAD, id: 'two', done: 75 }])).toBe(0.5)
    expect(shareOf([DOWNLOAD, { ...DOWNLOAD, id: 'two', total: null }])).toBeUndefined()
  })
})
