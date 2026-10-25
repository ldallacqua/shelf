import { describe, expect, it } from 'vitest'

import { parseMultiQuery, parseQuery, QueryError, runQuery } from '@/server/mocks/apicalypse'

const rows = [
  { id: 1, name: 'Alpha', game_type: { id: 0 }, total_rating_count: 50, platforms: [6, 48] },
  { id: 2, name: 'Beta: Deluxe', game_type: { id: 0 }, version_parent: 1, total_rating_count: 5 },
  { id: 3, name: 'Gamma', game_type: { id: 11 }, parent_game: 1, total_rating_count: 500 },
  { id: 4, name: 'alpha', game_type: { id: 8 }, total_rating_count: 900, platforms: [130] },
]

const run = (body: string) => runQuery(rows, parseQuery(body)).map((row) => row.id)

describe('parseQuery', () => {
  it('reads fields, where, sort, limit and offset', () => {
    expect(
      parseQuery('fields name,slug; where id = (1,2); sort id desc; limit 5; offset 10;'),
    ).toEqual({
      fields: ['name', 'slug'],
      where: [{ field: 'id', op: '=', value: [1, 2] }],
      sort: { field: 'id', descending: true },
      limit: 5,
      offset: 10,
    })
  })

  it('keeps a semicolon or an ampersand inside quotes as text', () => {
    const query = parseQuery('where name ~ "Ratchet & Clank; Rift" & game_type = (0); limit 1;')
    expect(query.where).toEqual([
      { field: 'name', op: '~', value: 'Ratchet & Clank; Rift' },
      { field: 'game_type', op: '=', value: [0] },
    ])
  })

  it('unescapes quotes in text', () => {
    expect(parseQuery('search "say \\"hi\\"";').search).toBe('say "hi"')
  })

  it('refuses what it does not understand, as IGDB would', () => {
    expect(() => parseQuery('nonsense here;')).toThrow(QueryError)
    expect(() => parseQuery('where id is 5;')).toThrow(QueryError)
    expect(() => parseQuery('search zelda;')).toThrow(QueryError)
    expect(() => parseQuery('limit many;')).toThrow(QueryError)
  })

  it('caps the limit at IGDB’s 500', () => {
    expect(parseQuery('limit 9000;').limit).toBe(500)
  })
})

describe('runQuery', () => {
  it('matches a list of ids', () => {
    expect(run('where id = (1,3); limit 10;')).toEqual([1, 3])
  })

  it('matches an expanded field by its id', () => {
    expect(run('where game_type = (8,11); limit 10;')).toEqual([3, 4])
  })

  it('tells null from present', () => {
    expect(run('where version_parent = null; limit 10;')).toEqual([1, 3, 4])
    expect(run('where version_parent != null; limit 10;')).toEqual([2])
  })

  it('matches a name without regard to case', () => {
    expect(run('where name ~ "ALPHA"; limit 10;')).toEqual([1, 4])
  })

  it('matches a name that holds, starts or ends with a text', () => {
    expect(parseQuery('where name ~ *"lph"*;').where).toEqual([
      { field: 'name', op: '~', value: 'lph', around: { before: true, after: true } },
    ])
    expect(run('where name ~ *"LPH"*; limit 10;')).toEqual([1, 4])
    expect(run('where name ~ "alp"*; limit 10;')).toEqual([1, 4])
    expect(run('where name ~ *"uxe"; limit 10;')).toEqual([2])
    expect(run('where name ~ *"alp"; limit 10;')).toEqual([])
  })

  it('combines conditions with and', () => {
    expect(run('where name ~ "alpha" & game_type = (0); limit 10;')).toEqual([1])
  })

  it('compares numbers', () => {
    expect(run('where total_rating_count > 50; limit 10;')).toEqual([3, 4])
    expect(run('where total_rating_count >= 50; limit 10;')).toEqual([1, 3, 4])
  })

  it('matches a value inside a list field', () => {
    expect(run('where platforms = (130); limit 10;')).toEqual([4])
  })

  it('searches by words in the name, best known first', () => {
    expect(run('search "alpha"; limit 10;')).toEqual([4, 1])
    expect(run('search "beta deluxe"; limit 10;')).toEqual([2])
  })

  it('searches whole words only, as IGDB does', () => {
    expect(run('search "alp"; limit 10;')).toEqual([])
    expect(run('search "beta delu"; limit 10;')).toEqual([])
  })

  it('sorts, limits and offsets', () => {
    expect(run('sort total_rating_count desc; limit 2;')).toEqual([4, 3])
    expect(run('sort total_rating_count desc; limit 2; offset 2;')).toEqual([1, 2])
  })

  it('returns only the id and the fields asked for', () => {
    const [row] = runQuery(rows, parseQuery('fields name,game_type.type; where id = 3;'))
    expect(row).toEqual({ id: 3, name: 'Gamma', game_type: { id: 11 } })
  })
})

describe('parseMultiQuery', () => {
  it('splits a multi-query into its blocks', () => {
    const blocks = parseMultiQuery(
      'query games "q0" { fields name; where id = 1; };\nquery genres "q1" { fields name; };',
    )
    expect(blocks).toEqual([
      { endpoint: 'games', name: 'q0', body: ' fields name; where id = 1; ' },
      { endpoint: 'genres', name: 'q1', body: ' fields name; ' },
    ])
  })

  it('refuses none, and more than ten', () => {
    expect(() => parseMultiQuery('fields name;')).toThrow(QueryError)
    const eleven = Array.from({ length: 11 }, (_, i) => `query games "q${i}" { fields name; };`)
    expect(() => parseMultiQuery(eleven.join('\n'))).toThrow(QueryError)
  })
})
