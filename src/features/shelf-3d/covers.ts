import {
  CanvasTexture,
  LinearFilter,
  NoColorSpace,
  Texture,
  Vector2,
  type WebGLRenderer,
} from 'three'

import { imageSizes, imageUrl } from '@/domain/igdb/images'

import { SMALL_PAGES } from './materials'

/**
 * Covers by distance (spec 3.3): far boxes show a blur of their colors and
 * need nothing loaded; boxes near the camera get IGDB's small cover, packed
 * into a few atlas pages; the nearest dozen get the large one, in a page of
 * their own; the pulled box gets the largest, alone.
 *
 * Each image is drawn through a canvas the size of its cell first, which
 * crops it to the cell's shape (covers vary a little) and lets any image the
 * browser can draw become a texture.
 */

export const PAGE_SIZE = 2048
export const SMALL = imageSizes.cover_small
export const SMALL_COLUMNS = Math.floor(PAGE_SIZE / SMALL.width)
export const SMALL_ROWS = Math.floor(PAGE_SIZE / SMALL.height)
export const SMALL_PER_PAGE = SMALL_COLUMNS * SMALL_ROWS

export const BIG = imageSizes.cover_big
export const BIG_COLUMNS = 4
export const BIG_ROWS = 3
export const BIG_SLOTS = BIG_COLUMNS * BIG_ROWS

/** Where a cover is: which kind of page, which page, and its cell's corner in texture space. */
export type CoverPlace = { source: 1 | 2; page: number; u: number; v: number }

/** How many images load at once. More competes with itself on a slow connection. */
const PARALLEL = 6

type Slot = { id: string; page: number; cell: number; used: number }

const page = (width: number, height: number, fill: string): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = fill
    context.fillRect(0, 0, width, height)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.flipY = false
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

/** A one-texel stand-in, so every sampler always has something bound. */
export const blankTexture = (): Texture => page(1, 1, '#000')

const fitted = (image: CanvasImageSource, width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const source = image as HTMLImageElement
  const sw = source.naturalWidth || source.width
  const sh = source.naturalHeight || source.height
  if (context && sw && sh) {
    // As object-fit: cover, centered.
    const scale = Math.max(width / sw, height / sh)
    const w = sw * scale
    const h = sh * scale
    context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
  }
  return canvas
}

export const loadImage = async (url: string, signal: AbortSignal): Promise<HTMLImageElement> => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  const aborted = () => {
    image.src = ''
  }
  signal.addEventListener('abort', aborted, { once: true })
  image.src = url
  try {
    await image.decode()
  } finally {
    signal.removeEventListener('abort', aborted)
  }
  return image
}

export class CoverAtlas {
  readonly small: CanvasTexture[]
  readonly big: CanvasTexture
  readonly smallCell: [number, number] = [SMALL.width / PAGE_SIZE, SMALL.height / PAGE_SIZE]
  readonly bigCell: [number, number] = [1 / BIG_COLUMNS, 1 / BIG_ROWS]

  private readonly renderer: WebGLRenderer
  private readonly onPlaced: (id: string) => void
  private readonly smallSlots = new Map<string, Slot>()
  private readonly bigSlots = new Map<string, Slot>()
  private readonly loading = new Map<string, AbortController>()
  private readonly failed = new Set<string>()
  private queue: { id: string; big: boolean }[] = []
  private clock = 0
  private disposed = false

  constructor(renderer: WebGLRenderer, onPlaced: (id: string) => void) {
    this.renderer = renderer
    this.onPlaced = onPlaced
    this.small = Array.from({ length: SMALL_PAGES }, () => page(PAGE_SIZE, PAGE_SIZE, '#1b1e27'))
    this.big = page(BIG.width * BIG_COLUMNS, BIG.height * BIG_ROWS, '#1b1e27')
    for (const texture of [...this.small, this.big]) renderer.initTexture(texture)
    // Uploaded once, then changed only a cell at a time on the GPU: the canvases can go.
    for (const texture of [...this.small, this.big]) {
      const canvas = texture.image as HTMLCanvasElement
      canvas.width = 1
      canvas.height = 1
    }
  }

  /** Where a cover is, preferring the large one. */
  place(id: string): CoverPlace | undefined {
    const big = this.bigSlots.get(id)
    if (big) {
      const column = big.cell % BIG_COLUMNS
      const row = Math.floor(big.cell / BIG_COLUMNS)
      return { source: 2, page: 0, u: column / BIG_COLUMNS, v: row / BIG_ROWS }
    }
    const small = this.smallSlots.get(id)
    if (small) {
      const column = small.cell % SMALL_COLUMNS
      const row = Math.floor(small.cell / SMALL_COLUMNS)
      return {
        source: 1,
        page: small.page,
        u: (column * SMALL.width) / PAGE_SIZE,
        v: (row * SMALL.height) / PAGE_SIZE,
      }
    }
    return undefined
  }

  /**
   * Says which covers are wanted now, nearest first: small ones for the boxes
   * near the camera, large ones for the nearest dozen. What is already in an
   * atlas stays until its cell is needed for something nearer.
   */
  want(small: readonly string[], big: readonly string[]): void {
    if (this.disposed) return
    this.clock += 1
    const queue: { id: string; big: boolean }[] = []
    for (const id of big.slice(0, BIG_SLOTS)) {
      const slot = this.bigSlots.get(id)
      if (slot) slot.used = this.clock
      else if (!this.failed.has(`big:${id}`)) queue.push({ id, big: true })
    }
    for (const id of small) {
      const slot = this.smallSlots.get(id)
      if (slot) slot.used = this.clock
      else if (!this.failed.has(id)) queue.push({ id, big: false })
    }
    // A load no longer wanted is let go.
    const wanted = new Set(queue.map((entry) => `${entry.big ? 'big:' : ''}${entry.id}`))
    for (const [key, controller] of this.loading) {
      if (!wanted.has(key)) {
        controller.abort()
        this.loading.delete(key)
      }
    }
    this.queue = queue
    this.pump()
  }

  private pump(): void {
    while (this.loading.size < PARALLEL && this.queue.length > 0) {
      const next = this.queue.shift()!
      const key = `${next.big ? 'big:' : ''}${next.id}`
      if (this.loading.has(key)) continue
      const controller = new AbortController()
      this.loading.set(key, controller)
      void this.load(next.id, next.big, controller.signal).finally(() => {
        if (this.loading.get(key) === controller) this.loading.delete(key)
        if (!this.disposed) this.pump()
      })
    }
  }

  private async load(id: string, big: boolean, signal: AbortSignal): Promise<void> {
    const size = big ? BIG : SMALL
    let image: HTMLImageElement
    try {
      image = await loadImage(imageUrl(id, big ? 'cover_big' : 'cover_small'), signal)
    } catch {
      if (!signal.aborted) this.failed.add(big ? `big:${id}` : id)
      return
    }
    if (signal.aborted || this.disposed) return

    const slots = big ? this.bigSlots : this.smallSlots
    const capacity = big ? BIG_SLOTS : SMALL_PER_PAGE * SMALL_PAGES
    const slot = this.claim(slots, capacity, big)
    slot.id = id
    slot.used = this.clock
    slots.set(id, slot)

    const cellsAcross = big ? BIG_COLUMNS : SMALL_COLUMNS
    const column = slot.cell % cellsAcross
    const row = Math.floor(slot.cell / cellsAcross)
    const source = new Texture(fitted(image, size.width, size.height))
    source.colorSpace = NoColorSpace
    source.flipY = false
    source.generateMipmaps = false
    const target = big ? this.big : this.small[slot.page]!
    this.renderer.copyTextureToTexture(
      source,
      target,
      null,
      new Vector2(column * size.width, row * size.height),
    )
    source.dispose()
    this.onPlaced(id)
  }

  /** A free cell, or the one used longest ago. */
  private claim(slots: Map<string, Slot>, capacity: number, big: boolean): Slot {
    if (slots.size < capacity) {
      const cell = slots.size
      return big
        ? { id: '', page: 0, cell, used: 0 }
        : { id: '', page: Math.floor(cell / SMALL_PER_PAGE), cell: cell % SMALL_PER_PAGE, used: 0 }
    }
    let oldest: Slot | undefined
    for (const slot of slots.values()) if (!oldest || slot.used < oldest.used) oldest = slot
    slots.delete(oldest!.id)
    // The box that showed it falls back to its colors until it is wanted again.
    this.onPlaced(oldest!.id)
    return { ...oldest!, id: '' }
  }

  /** The largest cover, alone, for the pulled box. */
  async own(id: string, signal: AbortSignal): Promise<Texture | undefined> {
    try {
      const image = await loadImage(imageUrl(id, 'cover_big_2x'), signal)
      if (signal.aborted) return undefined
      const { width, height } = imageSizes.cover_big_2x
      const texture = new CanvasTexture(fitted(image, width, height))
      texture.colorSpace = NoColorSpace
      texture.flipY = false
      return texture
    } catch {
      return undefined
    }
  }

  /** Bytes the atlases hold on the GPU. */
  get bytes(): number {
    return (
      (SMALL_PAGES * PAGE_SIZE * PAGE_SIZE + BIG.width * BIG_COLUMNS * BIG.height * BIG_ROWS) * 4
    )
  }

  dispose(): void {
    this.disposed = true
    for (const controller of this.loading.values()) controller.abort()
    this.loading.clear()
    for (const texture of [...this.small, this.big]) texture.dispose()
  }
}
