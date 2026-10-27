import { describe, expect, it } from 'vitest'

import { ADULTS_ONLY, ageLabel, ageWords, ageWordsOf } from './ages'

/** Age ratings (spec 5.1): a word for each board's rating, and a label for each word. */

const rated = (...pairs: [organization: number, rating: string][]) =>
  pairs.map(([organization, rating]) => ({ organization, rating_category: { rating } }))

describe('ageWordsOf', () => {
  it('names each board’s rating as IGDB records it, the board first', () => {
    // Skyrim, as IGDB rates it.
    expect(
      ageWordsOf(
        rated([5, '19+'], [7, 'MA 15+'], [1, 'M'], [4, '16'], [3, 'Z'], [2, '18'], [6, '18']),
      ),
    ).toEqual(['esrb-m', 'pegi-18', 'cero-z', 'usk-16', 'grac-19', 'classind-18', 'acb-ma15'])
  })

  it('knows the ESRB’s Adults Only, and Everyone 10+ by its plus', () => {
    expect(ageWordsOf(rated([1, 'AO']))).toEqual([ADULTS_ONLY])
    expect(ageWordsOf(rated([1, 'E10+'], [6, 'L']))).toEqual(['esrb-e10', 'classind-l'])
  })

  it('leaves out a board or a rating it does not know, and says each once', () => {
    expect(ageWordsOf(rated([99, '18'], [1, 'Z'], [2, '18'], [2, '18']))).toEqual(['pegi-18'])
    expect(ageWordsOf([{}, { organization: 1 }])).toEqual([])
  })
})

describe('ageLabel', () => {
  it('names a rating by its board, then as the board writes it', () => {
    expect(ageLabel('esrb-ao')).toBe('ESRB Adults Only 18+')
    expect(ageLabel('esrb-m')).toBe('ESRB Mature 17+')
    expect(ageLabel('pegi-18')).toBe('PEGI 18')
    expect(ageLabel('classind-l')).toBe('ClassInd L')
    expect(ageLabel('acb-r18')).toBe('ACB R 18+')
    expect(ageLabel('grac-all')).toBe('GRAC All')
  })

  it('has a word and a label for every rating, none twice', () => {
    expect(new Set(ageWords).size).toBe(ageWords.length)
    for (const word of ageWords) {
      expect(word).toMatch(/^[a-z]+-[a-z0-9]+$/)
      expect(ageLabel(word)).not.toBe(word)
    }
  })
})
