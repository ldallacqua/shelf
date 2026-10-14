/**
 * A set of games as one bit per game, 32 to a word. And, or and not over a
 * whole library are then a few dozen word operations, and counting a set is
 * counting bits: fast enough to count every value of every filter on each
 * change.
 */
export type Bitmap = Uint32Array

const words = (size: number) => Math.ceil(size / 32)

export const emptyBits = (size: number): Bitmap => new Uint32Array(words(size))

export const fullBits = (size: number): Bitmap => {
  const bits = new Uint32Array(words(size)).fill(0xffffffff)
  const spare = size % 32
  if (spare !== 0) bits[bits.length - 1] = (1 << spare) - 1
  return bits
}

export const setBit = (bits: Bitmap, index: number): void => {
  bits[index >>> 5]! |= 1 << (index & 31)
}

export const hasBit = (bits: Bitmap, index: number): boolean =>
  (bits[index >>> 5]! & (1 << (index & 31))) !== 0

export const andBits = (a: Bitmap, b: Bitmap): Bitmap => {
  const out = new Uint32Array(a.length)
  for (let at = 0; at < a.length; at += 1) out[at] = a[at]! & b[at]!
  return out
}

export const orBits = (a: Bitmap, b: Bitmap): Bitmap => {
  const out = new Uint32Array(a.length)
  for (let at = 0; at < a.length; at += 1) out[at] = a[at]! | b[at]!
  return out
}

/** Everything in `all` that is not in `bits`. */
export const notBits = (bits: Bitmap, all: Bitmap): Bitmap => {
  const out = new Uint32Array(bits.length)
  for (let at = 0; at < bits.length; at += 1) out[at] = ~bits[at]! & all[at]!
  return out
}

const ones = (word: number): number => {
  let value = word - ((word >>> 1) & 0x55555555)
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
  return (Math.imul((value + (value >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) as number
}

export const countBits = (bits: Bitmap): number => {
  let total = 0
  for (let at = 0; at < bits.length; at += 1) total += ones(bits[at]!)
  return total
}

/** How many games two sets share, without making a third. */
export const countShared = (a: Bitmap, b: Bitmap): number => {
  let total = 0
  for (let at = 0; at < a.length; at += 1) total += ones(a[at]! & b[at]!)
  return total
}

/** The positions in a set, in order. */
export const bitPositions = (bits: Bitmap): number[] => {
  const positions: number[] = []
  for (let at = 0; at < bits.length; at += 1) {
    let word = bits[at]!
    while (word !== 0) {
      const low = word & -word
      positions.push(at * 32 + (31 - Math.clz32(low)))
      word ^= low
    }
  }
  return positions
}
