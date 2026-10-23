import { describe, expect, it } from 'vitest'

import type { IgdbExternalGame } from '@/domain/igdb/schema'
import { chooseByStoreId } from '@/domain/sync/ladder'

// IGDB's `game_types`.
const MAIN = 0
const DLC = 1
const BUNDLE = 3
const SEASON = 7

const record = (id: number, type: number, more: Partial<IgdbExternalGame['game']> = {}) => ({
  id,
  name: `Game ${id}`,
  game_type: { id: type },
  ...more,
})

describe('the record a store id names', () => {
  it('is the one record IGDB files it under', () => {
    expect(chooseByStoreId([record(1, MAIN)])).toBe(1)
  })

  it('is the game, not an edition of it or a bundle holding it', () => {
    expect(chooseByStoreId([record(1, MAIN), record(2, MAIN, { version_parent: 1 })])).toBe(1)
    expect(chooseByStoreId([record(3, BUNDLE), record(1, MAIN)])).toBe(1)
  })

  it('is the game, when IGDB also files the id under one of its add-ons', () => {
    expect(chooseByStoreId([record(1, MAIN), record(2, DLC, { parent_game: 1 })])).toBe(1)
  })

  it('is the add-on, when IGDB files the id under that alone: the store lists it as something I play', () => {
    expect(chooseByStoreId([record(2, DLC, { parent_game: 1 })])).toBe(2)
    expect(chooseByStoreId([record(5, SEASON)])).toBe(5)
  })

  it('is no one when IGDB files it under two add-ons, or two games', () => {
    expect(chooseByStoreId([record(2, DLC), record(3, DLC)])).toBeUndefined()
    expect(chooseByStoreId([record(1, MAIN), record(4, MAIN)])).toBeUndefined()
    expect(chooseByStoreId([])).toBeUndefined()
  })
})
