import { http, HttpResponse } from 'msw'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { isHex, toHsl, fromHex } from '@/domain/color/palette'
import { coverArtFromImage, readCoverArt } from '@/server/igdb/cover-art'
import { network } from '@/test/network'

/** A made-up image, not a cover: a navy field with an orange band across it. */
const picture = async (): Promise<Uint8Array> => {
  const band = await sharp({
    create: { width: 90, height: 40, channels: 3, background: { r: 240, g: 120, b: 20 } },
  })
    .png()
    .toBuffer()
  return sharp({
    create: { width: 90, height: 128, channels: 3, background: { r: 16, g: 24, b: 64 } },
  })
    .composite([{ input: band, top: 20, left: 0 }])
    .webp()
    .toBuffer()
}

describe('coverArtFromImage', () => {
  it('reads three colors: the accent is the orange, the base is the navy', async () => {
    const { colors } = await coverArtFromImage(await picture())
    expect(colors.every(isHex)).toBe(true)
    const [accentHue] = toHsl(fromHex(colors[0]))
    const [baseHue] = toHsl(fromHex(colors[2]))
    expect(accentHue).toBeGreaterThan(15)
    expect(accentHue).toBeLessThan(40)
    expect(baseHue).toBeGreaterThan(215)
    expect(baseHue).toBeLessThan(245)
  })

  it('makes a blurred preview of about 25 bytes', async () => {
    const { thumbhash } = await coverArtFromImage(await picture())
    const bytes = Buffer.from(thumbhash, 'base64').length
    expect(bytes).toBeGreaterThan(10)
    expect(bytes).toBeLessThanOrEqual(30)
  })

  it('gives the same reading for the same image', async () => {
    const image = await picture()
    expect(await coverArtFromImage(image)).toEqual(await coverArtFromImage(image))
  })
})

describe('readCoverArt', () => {
  const address = 'https://images.igdb.com/igdb/image/upload/t_cover_small/co1abc.webp'

  it('fetches the small cover from IGDB’s image servers and reads it', async () => {
    const image = await picture()
    network.use(
      http.get(address, () =>
        HttpResponse.arrayBuffer(image.buffer as ArrayBuffer, {
          headers: { 'Content-Type': 'image/webp' },
        }),
      ),
    )
    const art = await readCoverArt('co1abc')
    expect(art?.colors).toHaveLength(3)
    expect(art?.thumbhash).toBeTruthy()
  })

  it('answers undefined when the cover is missing: a game is still addable', async () => {
    network.use(http.get(address, () => new HttpResponse(null, { status: 404 })))
    expect(await readCoverArt('co1abc')).toBeUndefined()
  })

  it('answers undefined when what arrives is not an image', async () => {
    network.use(http.get(address, () => HttpResponse.text('not an image')))
    expect(await readCoverArt('co1abc')).toBeUndefined()
  })

  it('answers undefined for something that is not an image id, without a request', async () => {
    expect(await readCoverArt('../secrets')).toBeUndefined()
  })
})
