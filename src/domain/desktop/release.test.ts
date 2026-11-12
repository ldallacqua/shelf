import { describe, expect, it } from 'vitest'

import { installerIn } from './release'

const URL_0_18 =
  'https://github.com/ldallacqua/shelf/releases/download/desktop-v0.18.0/Shelf_0.18.0_x64-setup.exe'

/** `latest.json` as `pnpm desktop:release` writes it. */
const latest = (url: unknown) => ({
  version: '0.18.0',
  notes: 'Shelf 0.18.0',
  pub_date: '2026-11-10T19:42:35Z',
  platforms: { 'windows-x86_64': { signature: 'c2lnbmF0dXJl', url } },
})

describe('the installer a download button leads to', () => {
  it('is the 64-bit Windows installer the newest release names, with its version', () => {
    expect(installerIn(latest(URL_0_18))).toEqual({ url: URL_0_18, version: '0.18.0' })
  })

  it('is nothing for a file that is not a release’s description', () => {
    for (const odd of [null, 'latest', 42, {}, { platforms: null }, { platforms: { linux: {} } }]) {
      expect(installerIn(odd)).toBeUndefined()
    }
    expect(installerIn(latest(undefined))).toBeUndefined()
  })

  it('is never an address outside this repository’s releases', () => {
    for (const elsewhere of [
      'https://example.com/Shelf_0.18.0_x64-setup.exe',
      'https://github.com/someone/shelf/releases/download/desktop-v0.18.0/Shelf_0.18.0_x64-setup.exe',
      'http://github.com/ldallacqua/shelf/releases/download/desktop-v0.18.0/Shelf_0.18.0_x64-setup.exe',
      `${URL_0_18}?then=https://example.com`,
      'https://github.com/ldallacqua/shelf/releases/download/desktop-v0.18.0/../../evil.exe',
      'https://github.com/ldallacqua/shelf/releases/download/desktop-v0.18.0/Shelf.msi',
    ]) {
      expect(installerIn(latest(elsewhere))).toBeUndefined()
    }
  })
})
