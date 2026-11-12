import { describe, expect, it } from 'vitest'

import {
  askingSteps,
  byHandOnly,
  nextStep,
  openingStep,
  parseSetupMemory,
  placesWithLinks,
  previousStep,
  setupSteps,
  sourcesFor,
  writeSetupMemory,
} from './setup'

describe('the setup steps', () => {
  it('go from where I play to ready, and only the four before ready ask anything', () => {
    expect(setupSteps).toEqual(['play', 'bring', 'look', 'sort', 'ready'])
    expect(askingSteps).toEqual(['play', 'bring', 'look', 'sort'])
  })

  it('step forward and back, and stop at either end', () => {
    expect(nextStep('play')).toBe('bring')
    expect(nextStep('sort')).toBe('ready')
    expect(nextStep('ready')).toBe('ready')
    expect(previousStep('bring')).toBe('play')
    expect(previousStep('play')).toBe('play')
  })
})

describe('what the setup remembers', () => {
  it('reads back what it wrote, places in their own order', () => {
    const written = writeSetupMemory({
      step: 'look',
      places: ['xbox', 'pc', 'switch'],
      looked: true,
    })
    expect(parseSetupMemory(written)).toEqual({
      step: 'look',
      places: ['pc', 'switch', 'xbox'],
      looked: true,
    })
  })

  it('starts afresh from anything it cannot read, and keeps what it can', () => {
    const fresh = { step: 'play', places: [], looked: false }
    expect(parseSetupMemory(null)).toEqual(fresh)
    expect(parseSetupMemory('not json')).toEqual(fresh)
    expect(parseSetupMemory('42')).toEqual(fresh)
    expect(parseSetupMemory('null')).toEqual(fresh)
    expect(parseSetupMemory(JSON.stringify({ step: 'later', places: 'pc' }))).toEqual(fresh)
    expect(
      parseSetupMemory(
        JSON.stringify({ step: 'sort', places: ['pc', 'dreamcast', 'pc'], looked: 1 }),
      ),
    ).toEqual({ step: 'sort', places: ['pc'], looked: false })
  })
})

describe('the step the page opens on', () => {
  it('is the one the address names, so Settings can start the flow over', () => {
    expect(openingStep({ hash: '#play', backFromSteam: true, stored: 'ready' })).toBe('play')
    expect(openingStep({ hash: '#look', backFromSteam: false, stored: 'play' })).toBe('look')
  })

  it('is bringing games in, back from Steam’s sign-in', () => {
    expect(openingStep({ hash: '', backFromSteam: true, stored: 'play' })).toBe('bring')
  })

  it('is where this device left it otherwise, an address it does not know included', () => {
    expect(openingStep({ hash: '', backFromSteam: false, stored: 'sort' })).toBe('sort')
    expect(openingStep({ hash: '#platforms', backFromSteam: false, stored: 'look' })).toBe('look')
  })
})

describe('where I play', () => {
  it('gains the places a linked platform says, and keeps the ones I chose', () => {
    expect(placesWithLinks([], ['steam'])).toEqual(['pc'])
    expect(placesWithLinks(['physical'], ['nintendo', 'steam'])).toEqual([
      'pc',
      'switch',
      'physical',
    ])
    expect(placesWithLinks(['xbox'], [])).toEqual(['xbox'])
  })

  it('offers the platform each place syncs from, or both when no chosen place syncs', () => {
    expect(sourcesFor(['pc'])).toEqual(['steam'])
    expect(sourcesFor(['switch', 'playstation'])).toEqual(['nintendo'])
    expect(sourcesFor(['pc', 'switch'])).toEqual(['steam', 'nintendo'])
    expect(sourcesFor([])).toEqual(['steam', 'nintendo'])
    expect(sourcesFor(['xbox', 'physical'])).toEqual(['steam', 'nintendo'])
  })

  it('says which places only a pasted list reaches today', () => {
    expect(byHandOnly(['pc', 'playstation', 'xbox', 'physical'])).toEqual([
      'playstation',
      'xbox',
      'physical',
    ])
    expect(byHandOnly(['pc', 'switch'])).toEqual([])
  })
})
