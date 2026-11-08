import { createFormatter } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { sizeOf } from './size'

/** Sizes, as the saves and the downloads say them. */
const format = createFormatter({ locale: 'en', timeZone: 'UTC' })

describe('a size', () => {
  it('is bytes under a kilobyte, never "0 kB"', () => {
    expect(sizeOf(format, 11)).toBe('11 bytes')
  })

  it('is bytes in Portuguese too', () => {
    expect(sizeOf(createFormatter({ locale: 'pt-BR', timeZone: 'UTC' }), 1)).toBe('1 byte')
    expect(sizeOf(createFormatter({ locale: 'pt-BR', timeZone: 'UTC' }), 11)).toBe('11 bytes')
  })

  it('takes the unit a person reads it in', () => {
    expect(sizeOf(format, 12_000)).toBe('11.7 kB')
    expect(sizeOf(format, 3_400_000)).toBe('3.2 MB')
    expect(sizeOf(format, 13_314_398_618)).toBe('12.4 GB')
  })
})
