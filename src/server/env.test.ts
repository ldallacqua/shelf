import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  databaseTarget,
  deployment,
  igdbEnv,
  MissingSettingsError,
  mocksRequested,
  onVercel,
} from '@/server/env'

const NAMES = [
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'SHELF_DATABASE_FILE',
  'SHELF_MOCKS',
  'VERCEL',
  'VERCEL_ENV',
]

beforeEach(() => {
  for (const name of NAMES) vi.stubEnv(name, '')
})
afterEach(() => vi.unstubAllEnvs())

describe('igdbEnv', () => {
  it('returns the Twitch application', () => {
    vi.stubEnv('TWITCH_CLIENT_ID', 'id')
    vi.stubEnv('TWITCH_CLIENT_SECRET', 'secret')
    expect(igdbEnv()).toEqual({ clientId: 'id', clientSecret: 'secret' })
  })

  it('names what is missing, and never a value', () => {
    vi.stubEnv('TWITCH_CLIENT_ID', 'the-id-value')
    const error = (() => {
      try {
        igdbEnv()
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(MissingSettingsError)
    expect((error as MissingSettingsError).names).toEqual(['TWITCH_CLIENT_SECRET'])
    expect((error as Error).message).toContain('TWITCH_CLIENT_SECRET')
    expect((error as Error).message).not.toContain('the-id-value')
  })

  it('treats a blank value as missing', () => {
    vi.stubEnv('TWITCH_CLIENT_ID', '   ')
    vi.stubEnv('TWITCH_CLIENT_SECRET', 'secret')
    expect(() => igdbEnv()).toThrow(/TWITCH_CLIENT_ID/)
  })
})

describe('where the app is running', () => {
  it('is local unless Vercel says otherwise', () => {
    expect(onVercel()).toBe(false)
    expect(deployment()).toBe('local')
  })

  it('knows a preview from production', () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(onVercel()).toBe(true)
    expect(deployment()).toBe('preview')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(deployment()).toBe('production')
  })

  it('asks for test doubles only with SHELF_MOCKS=1', () => {
    expect(mocksRequested()).toBe(false)
    vi.stubEnv('SHELF_MOCKS', 'true')
    expect(mocksRequested()).toBe(false)
    vi.stubEnv('SHELF_MOCKS', '1')
    expect(mocksRequested()).toBe(true)
  })
})

describe('databaseTarget', () => {
  let folder: string

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'shelf-env-'))
  })
  afterEach(() => {
    chmodSync(folder, 0o755)
    rmSync(folder, { recursive: true, force: true })
  })

  it('is Turso when its address and token are set', () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://shelf.example')
    vi.stubEnv('TURSO_AUTH_TOKEN', 'token')
    expect(databaseTarget()).toEqual({
      kind: 'turso',
      url: 'libsql://shelf.example',
      authToken: 'token',
    })
  })

  it('stops, naming the token, when only the address is set', () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://shelf.example')
    expect(() => databaseTarget()).toThrow(/TURSO_AUTH_TOKEN/)
  })

  it('is the local file otherwise, and that file keeps what is written', () => {
    const file = join(folder, 'shelf.db')
    vi.stubEnv('SHELF_DATABASE_FILE', file)
    expect(databaseTarget()).toEqual({ kind: 'file', path: file, durable: true })
  })

  it('does not count a file built during a Vercel build as kept', () => {
    vi.stubEnv('SHELF_DATABASE_FILE', join(folder, 'shelf.db'))
    vi.stubEnv('VERCEL', '1')
    expect(databaseTarget()).toMatchObject({ kind: 'file', durable: false })
  })

  // Windows ignores a folder's mode bits, so chmod cannot make one unwritable there.
  // Deployed functions run on Linux, which is where this matters.
  it.skipIf(process.platform === 'win32')(
    'works on a copy where the folder cannot be written, as in a deployed function',
    () => {
      const data = join(folder, 'readonly')
      mkdirSync(data)
      const file = join(data, 'shelf.db')
      writeFileSync(file, 'sample')
      chmodSync(data, 0o555)
      vi.stubEnv('SHELF_DATABASE_FILE', file)

      const target = databaseTarget()
      chmodSync(data, 0o755)

      expect(target).toMatchObject({ kind: 'file', durable: false })
      expect(target.kind === 'file' && target.path).not.toBe(file)
      expect(target.kind === 'file' && target.path.startsWith(tmpdir())).toBe(true)
    },
  )
})
