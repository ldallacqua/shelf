import { describe, expect, it } from 'vitest'

import { argumentsOf, compareMessages, flatten, zeroAsOne } from './compare-messages.ts'

describe('flatten', () => {
  it('turns nested messages into dotted paths', () => {
    const flat = flatten({ Shell: { menu: 'Menu', nav: { library: 'Library' } } })
    expect([...flat]).toEqual([
      ['Shell.menu', 'Menu'],
      ['Shell.nav.library', 'Library'],
    ])
  })
})

describe('argumentsOf', () => {
  it('finds simple, formatted and rich-text arguments', () => {
    expect(argumentsOf('{count, number} games from <link>IGDB</link> for {name}')).toEqual([
      '<link>',
      '{count}',
      '{name}',
    ])
  })

  it('ignores the words inside select and plural branches', () => {
    expect(argumentsOf('{time, select, day {in daylight} other {under a spot}}')).toEqual([
      '{time}',
    ])
  })

  it('finds an argument nested inside a plural branch', () => {
    expect(argumentsOf('{count, plural, one {# game by {studio}} other {# games}}')).toEqual([
      '{count}',
      '{studio}',
    ])
  })
})

describe('compareMessages', () => {
  const en = { A: { title: 'Hello {name}', body: 'Text' } }

  it('accepts a complete translation', () => {
    expect(compareMessages(en, { pt: { A: { title: 'Olá {name}', body: 'Texto' } } })).toEqual([])
  })

  it('reports a missing key', () => {
    expect(compareMessages(en, { pt: { A: { title: 'Olá {name}' } } })).toEqual([
      { locale: 'pt', key: 'A.body', kind: 'missing' },
    ])
  })

  it('reports a key English does not have', () => {
    const problems = compareMessages(en, {
      pt: { A: { title: 'Olá {name}', body: 'Texto', more: 'Mais' } },
    })
    expect(problems).toEqual([{ locale: 'pt', key: 'A.more', kind: 'extra' }])
  })

  it('reports an empty text', () => {
    const problems = compareMessages(en, { pt: { A: { title: 'Olá {name}', body: ' ' } } })
    expect(problems).toEqual([{ locale: 'pt', key: 'A.body', kind: 'empty' }])
  })

  it('reports a placeholder that was renamed or dropped', () => {
    const problems = compareMessages(en, { pt: { A: { title: 'Olá {nome}', body: 'Texto' } } })
    expect(problems).toMatchObject([{ locale: 'pt', key: 'A.title', kind: 'placeholders' }])
  })

  it('reports a Portuguese plural that would say zero in the singular', () => {
    const counted = { A: { games: '{count, plural, one {# game} other {# games}}' } }
    expect(
      compareMessages(counted, {
        'pt-BR': { A: { games: '{count, plural, one {# jogo} other {# jogos}}' } },
      }),
    ).toMatchObject([{ locale: 'pt-BR', key: 'A.games', kind: 'zero' }])
    expect(
      compareMessages(counted, {
        'pt-BR': { A: { games: '{count, plural, =0 {# jogos} one {# jogo} other {# jogos}}' } },
      }),
    ).toEqual([])
  })
})

describe('zeroAsOne', () => {
  it('finds a plural with one and no =0, nested too', () => {
    expect(zeroAsOne('{n, plural, one {# hora} other {# horas}}')).toBe(true)
    expect(zeroAsOne('{n, plural, =0 {nada} one {# hora} other {# horas}}')).toBe(false)
    expect(zeroAsOne('{n, plural, other {zerados}}')).toBe(false)
    expect(zeroAsOne('{a, select, x {{n, plural, one {# jogo} other {# jogos}}} other {}}')).toBe(
      true,
    )
    expect(zeroAsOne('Sem plural, {name}')).toBe(false)
  })
})
