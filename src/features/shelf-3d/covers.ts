import {
  CanvasTexture,
  LinearFilter,
  NoColorSpace,
  Texture,
  Vector2,
  type WebGLRenderer,
} from 'three'

import { type ImageSize, imageSizes, imageUrl } from '@/domain/igdb/images'

import { COVER_PAGES } from './materials'

/**
 * Covers on the boxes (spec 3.3). A box whose cover has not arrived shows a
 * blur of its stored colors, which needs nothing loaded. The boxes in view,
 * and those either side of them, get their covers at the size they appear on
 * screen, packed into a few atlas pages; the pulled box gets the largest,
 * alone.
 *
 * The file is the one the 2D shelf asks for on this screen, so a cover the 2D
 * shelf has shown (it always draws first) comes from the browser's cache.
 * Each image is drawn through a canvas the size of its cell, which crops it to
 * the cell's shape (covers vary a little) and shrinks it with the browser's
 * own filtering. The GPU then reads about one texel per pixel: sharp, and
 * still while the camera walks.
 */

export const PAGE_SIZE = 2048

/** The files a cell can be filled from, smallest first. Each is a cover's shape at a different width. */
const FILES = ['cover_small', 'cover_small_2x', 'cover_big'] as const satisfies readonly ImageSize[]
const LARGEST = imageSizes.cover_big
/** Height over width of a cover. */
const TALL = LARGEST.height / LARGEST.width
/** Smaller than this, a cover is a few colored pixels whatever its cells are. */
const SMALLEST_CELL = 48

/** Where a cover is: which page, and its cell's corner in texture space. */
export type CoverPlace = { page: number; u: number; v: number }

/** How many images load at once. More competes with itself on a slow connection. */
const PARALLEL = 8

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
    context.imageSmoothingQuality = 'high'
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

/** The smallest file at least `width` device pixels across, or the largest there is. */
export const fileFor = (width: number): (typeof FILES)[number] =>
  FILES.find((name) => imageSizes[name].width >= width) ?? 'cover_big'

/**
 * The cell for a cover drawn `width` device pixels across: that size, within
 * what a cover file holds. Whole pixels, the shape of a cover.
 */
export const cellFor = (width: number): { width: number; height: number } => {
  const across = Math.round(Math.min(LARGEST.width, Math.max(SMALLEST_CELL, width)))
  return { width: across, height: Math.round(across * TALL) }
}

/**
 * Whether cells made for `current` still serve a cover now drawn `wanted`
 * across. A little larger than needed is kept: shrinking them reloads every
 * cover, and a window being dragged narrower would do that at every step.
 */
export const cellStillFits = (current: number, wanted: number): boolean =>
  cellFor(wanted).width <= current && cellFor(wanted).width >= current * 0.75

export class CoverAtlas {
  readonly pages: CanvasTexture[]
  /** A cell's size in texture space. The box shader holds this array, so it is changed in place. */
  readonly cell: [number, number] = [0, 0]

  private readonly renderer: WebGLRenderer
  private readonly onPlaced: (id: string) => void
  private readonly slots = new Map<string, Slot>()
  private readonly loading = new Map<string, AbortController>()
  private readonly failed = new Set<string>()
  private queue: string[] = []
  private clock = 0
  private disposed = false
  private size = cellFor(LARGEST.width)
  private columns = 1
  private perPage = 1
  private file: (typeof FILES)[number] = 'cover_big'

  constructor(renderer: WebGLRenderer, onPlaced: (id: string) => void) {
    this.renderer = renderer
    this.onPlaced = onPlaced
    this.pages = Array.from({ length: COVER_PAGES }, () => page(PAGE_SIZE, PAGE_SIZE, '#1b1e27'))
    for (const texture of this.pages) renderer.initTexture(texture)
    // Uploaded once, then changed only a cell at a time on the GPU: the canvases can go.
    for (const texture of this.pages) {
      const canvas = texture.image as HTMLCanvasElement
      canvas.width = 1
      canvas.height = 1
    }
    this.cut(this.size)
  }

  /** How many covers the pages hold at the current cell size. */
  get capacity(): number {
    return this.perPage * COVER_PAGES
  }

  /**
   * Sizes the cells for covers drawn `cell` device pixels across, filled from
   * the file the screen's density asks for at `file` pixels. When either
   * changes, the covers held so far are let go and load again (mostly from
   * the cache), and their boxes show their colors in between.
   */
  fit(cell: number, file: number): void {
    const name = fileFor(file)
    if (cellStillFits(this.size.width, cell) && name === this.file) return
    this.file = name
    this.cut(cellFor(cell))
    for (const controller of this.loading.values()) controller.abort()
    this.loading.clear()
    const held = [...this.slots.keys()]
    this.slots.clear()
    this.failed.clear()
    for (const id of held) this.onPlaced(id)
  }

  private cut(size: { width: number; height: number }): void {
    this.size = size
    this.columns = Math.floor(PAGE_SIZE / size.width)
    this.perPage = this.columns * Math.floor(PAGE_SIZE / size.height)
    this.cell[0] = size.width / PAGE_SIZE
    this.cell[1] = size.height / PAGE_SIZE
  }

  /** Where a cover is, if it has arrived. */
  place(id: string): CoverPlace | undefined {
    const slot = this.slots.get(id)
    if (!slot) return undefined
    const column = slot.cell % this.columns
    const row = Math.floor(slot.cell / this.columns)
    return {
      page: slot.page,
      u: (column * this.size.width) / PAGE_SIZE,
      v: (row * this.size.height) / PAGE_SIZE,
    }
  }

  /**
   * Says which covers are wanted now, nearest first. What is already in an
   * atlas stays until its cell is needed for something nearer.
   */
  want(ids: readonly string[]): void {
    if (this.disposed) return
    this.clock += 1
    const queue: string[] = []
    for (const id of ids.slice(0, this.capacity)) {
      const slot = this.slots.get(id)
      if (slot) slot.used = this.clock
      else if (!this.failed.has(id)) queue.push(id)
    }
    // A load no longer wanted is let go.
    const wanted = new Set(queue)
    for (const [id, controller] of this.loading) {
      if (!wanted.has(id)) {
        controller.abort()
        this.loading.delete(id)
      }
    }
    this.queue = queue
    this.pump()
  }

  private pump(): void {
    while (this.loading.size < PARALLEL && this.queue.length > 0) {
      const id = this.queue.shift()!
      if (this.loading.has(id)) continue
      const controller = new AbortController()
      this.loading.set(id, controller)
      void this.load(id, controller.signal).finally(() => {
        if (this.loading.get(id) === controller) this.loading.delete(id)
        if (!this.disposed) this.pump()
      })
    }
  }

  private async load(id: string, signal: AbortSignal): Promise<void> {
    let image: HTMLImageElement
    try {
      image = await loadImage(imageUrl(id, this.file), signal)
    } catch {
      if (!signal.aborted) this.failed.add(id)
      return
    }
    if (signal.aborted || this.disposed) return

    const slot = this.claim()
    slot.id = id
    slot.used = this.clock
    this.slots.set(id, slot)

    const { width, height } = this.size
    const column = slot.cell % this.columns
    const row = Math.floor(slot.cell / this.columns)
    const source = new Texture(fitted(image, width, height))
    source.colorSpace = NoColorSpace
    source.flipY = false
    source.generateMipmaps = false
    this.renderer.copyTextureToTexture(
      source,
      this.pages[slot.page]!,
      null,
      new Vector2(column * width, row * height),
    )
    source.dispose()
    this.onPlaced(id)
  }

  /** A free cell, or the one used longest ago. */
  private claim(): Slot {
    if (this.slots.size < this.capacity) {
      const at = this.slots.size
      return { id: '', page: Math.floor(at / this.perPage), cell: at % this.perPage, used: 0 }
    }
    let oldest: Slot | undefined
    for (const slot of this.slots.values()) if (!oldest || slot.used < oldest.used) oldest = slot
    this.slots.delete(oldest!.id)
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
    return COVER_PAGES * PAGE_SIZE * PAGE_SIZE * 4
  }

  dispose(): void {
    this.disposed = true
    for (const controller of this.loading.values()) controller.abort()
    this.loading.clear()
    for (const texture of this.pages) texture.dispose()
  }
}
