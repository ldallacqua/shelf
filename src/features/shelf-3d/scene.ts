import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Mesh,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type CanvasTexture,
  type ShaderMaterial,
  type Texture,
} from 'three'

import type { Status } from '@/domain/library/values'
import { duration } from '@/ui/tokens/motion'
import { caseShapes, type CaseShape } from '@/ui/game-case'

import {
  aim,
  createRig,
  distanceFor,
  FIELD_OF_VIEW,
  limits,
  nudge,
  relimit,
  step,
  visibleWidth,
  type Rig,
} from './camera-rig'
import { blankTexture, CoverAtlas } from './covers'
import {
  drawDigits,
  drawLabels,
  drawSpines,
  LABEL_HEIGHT,
  SPINE,
  type Fonts,
  type LabelText,
  type SpineText,
} from './labels'
import {
  BACK_GAP,
  BAY_GAP,
  BAY_WIDTH,
  boxAt,
  caseDepths,
  COVER_ONLY_DEPTH,
  COVER_ONLY_SCALE,
  FLOOR,
  layoutRoom,
  LEDGE_DEPTH,
  LEDGE_THICKNESS,
  LEDGES_PER_BAY,
  type RoomLayout,
  type Standing,
} from './layout'
import {
  applyLighting,
  boxMaterial,
  glowMaterial,
  labelMaterial,
  ledgeTexture,
  PART_BAR,
  PART_LEDGE,
  PART_UPRIGHT,
  partMaterial,
  roomUniforms,
  COVER_PAGES,
  SPINE_PAGES,
  wallMaterial,
  writeLedge,
  type BoxTextures,
  type RoomUniforms,
} from './materials'
import { curve, damp, settled } from './motion'
import type { Lighting, Rgb } from './tokens'

/** One game as the scene draws it. Everything here is decided by the page, in its own words and colors. */
export type SceneGame = {
  /** Stable across regroups: the same box slides from where it stood. */
  key: string
  shape: CaseShape
  coverOnly: boolean
  status: Status
  /** How many platforms it is owned on. */
  owned: number
  cover?: string
  /** The cover's three colors, most dominant last, as the 2D wash. */
  wash: [Rgb, Rgb, Rgb]
  plastic: Rgb
  /** The light it gives off when in focus. */
  led: Rgb
  spine: SpineText
}

export type SceneShelf = { label: LabelText; games: SceneGame[] }

export type SceneStats = {
  frames: number
  calls: number
  triangles: number
  textures: number
  textureBytes: number
  boxes: number
  pixelRatio: number
  cameraX: number
  hot?: number
  pulled?: number
  slowFrames: number
}

type Options = {
  /** Reduced motion: the camera cuts and nothing glides. */
  calm: boolean
  fonts: Fonts
  /** The graphics context was lost. */
  onLost: () => void
  /** Frames stayed slow even at the lowest resolution. */
  onSlow: () => void
  /** After each frame is drawn. */
  onFrame?: (stats: SceneStats) => void
}

/** The highest resolution, in device pixels per CSS pixel; lowered when frames run slow. */
const MAX_PIXEL_RATIO = 1.75
const PIXEL_RATIOS = [1.75, 1.25, 1, 0.75]
/** A frame slower than this, while something moves, counts as slow: under 30 a second. */
const SLOW_FRAME_MS = 34
/** How many frames in a row to judge by. */
const JUDGE_FRAMES = 45

/** A box in focus comes this far toward you, and a playing one stands this far forward. */
const FORWARD = { hot: 44, playing: 16 }
/** The most a box grows on screen: a game being played and the one under the pointer stand larger, and nearer. */
const HOT_GROWTH = 1.1
/** Lean of a dropped game, in radians: 5 degrees, against its neighbor to the right. */
const LEAN = (-5 * Math.PI) / 180
/** The pulled box comes this far out of the wall. */
const PULL_OUT = 320
/** How far from the wall the camera stands when a box is pulled, as a share of its usual distance. */
const PULL_DOLLY = 0.62
/** The camera's tilt in full 3D: it stands a little low and looks at the middle, so the wall leans back. */
const TILT = { lift: -170, look: 0 }

const STATUS_CODE: Record<Status, number> = {
  backlog: 0,
  playing: 1,
  completed: 2,
  dropped: 3,
  wishlist: 4,
  // Drawn as a backlog game is: the shader marks only completed and wishlist games.
  unsorted: 5,
}

type ShapeMesh = {
  mesh: InstancedMesh
  geometry: BufferGeometry
  /** Which box, by index into the layout, each instance draws. */
  boxes: number[]
  attributes: {
    wash0: InstancedBufferAttribute
    wash1: InstancedBufferAttribute
    wash2: InstancedBufferAttribute
    plastic: InstancedBufferAttribute
    cover: InstancedBufferAttribute
    state: InstancedBufferAttribute
    spine: InstancedBufferAttribute
    ledge: InstancedBufferAttribute
  }
}

const instanced = (count: number, size: number, dynamic = false) => {
  const attribute = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * size), size)
  if (dynamic) attribute.setUsage(DynamicDrawUsage)
  return attribute
}

export class ShelfScene {
  readonly renderer: WebGLRenderer
  private readonly canvas: HTMLCanvasElement
  private readonly options: Options
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 50, 60_000)
  private readonly uniforms: RoomUniforms = roomUniforms()
  private readonly covers: CoverAtlas
  private readonly blank: Texture = blankTexture()
  private readonly digits: CanvasTexture
  private readonly dummy = new Object3D()
  private spines: CanvasTexture[] = []
  private spineCells: { page: number; u: number; v: number }[] = []
  private labels?: CanvasTexture
  private labelMesh?: InstancedMesh

  private layout: RoomLayout = layoutRoom([], 'covers')
  private games: SceneGame[] = []
  private standing: Standing = 'covers'
  private shapes = new Map<CaseShape, ShapeMesh>()
  /** For each box: its mesh and its instance in it. */
  private where: { shape: CaseShape; instance: number }[] = []
  /** Which boxes show each cover. */
  private byCover = new Map<string, number[]>()
  private room: Object3D[] = []

  private rig: Rig = createRig(0, 0, 0)
  private width = 1
  private height = 1
  private distance = 3000
  private middle = 900
  private pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1)

  // Per box, what moves: how far forward it is, and toward what; where it slides from after a regroup.
  private forward = new Float32Array(0)
  private forwardTarget = new Float32Array(0)
  private slideFrom = new Float32Array(0)
  private slideStart = 0
  private sliding = false
  private moving = new Set<number>()

  // Per ledge, its LED's color now and where it is going.
  private ledColor = new Float32Array(0)
  private ledTarget = new Float32Array(0)
  private restingLed: Rgb = [0.49, 0.36, 1]

  private hot?: number
  private pulled?: number
  private pull = { amount: 0, target: 0, box: -1 }
  private pullMesh?: {
    mesh: InstancedMesh
    material: ShaderMaterial
    own?: Texture
    abort?: AbortController
  }
  /** Space a panel takes on the right while a box is pulled, in CSS pixels. */
  private avoidRight = 0

  private flat = { amount: 0, from: 0, to: 0, start: 0, length: 0 }
  private raf = 0
  private last = 0
  private frames = 0
  private slowFrames = 0
  private recent: number[] = []
  private coversAt = Number.NaN
  private disposed = false

  constructor(canvas: HTMLCanvasElement, options: Options) {
    this.canvas = canvas
    this.options = options
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    })
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL 2 is not available')
    renderer.outputColorSpace = LinearSRGBColorSpace
    renderer.toneMapping = NoToneMapping
    renderer.setPixelRatio(this.pixelRatio)
    this.renderer = renderer
    canvas.addEventListener('webglcontextlost', this.lost)

    this.covers = new CoverAtlas(renderer, (id) => this.coverPlaced(id))
    this.digits = drawDigits(options.fonts)
  }

  private lost = (event: Event) => {
    event.preventDefault()
    this.stop()
    this.options.onLost()
  }

  /* ---------------------------------------------------------- the room */

  /** Builds the room for these shelves. Boxes on screen slide from where they stood. */
  setRoom(shelves: readonly SceneShelf[], standing: Standing, light: Lighting): void {
    const before = new Map<string, { x: number; y: number }>()
    const seen = visibleWidth(this.distance, this.width / this.height)
    for (const [at, game] of this.games.entries()) {
      const box = this.layout.boxes[at]
      if (box && Math.abs(box.x - this.rig.x) < seen) before.set(game.key, { x: box.x, y: box.y })
    }
    const hotKey = this.hot === undefined ? undefined : this.games[this.hot]?.key

    this.unpullNow()
    this.pulled = undefined
    this.standing = standing
    this.games = shelves.flatMap((shelf) => shelf.games)
    this.layout = layoutRoom(
      shelves.map((shelf) =>
        shelf.games.map((game) => ({ shape: game.shape, coverOnly: game.coverOnly })),
      ),
      standing,
    )
    this.clearRoom()
    this.restingLed = light.led
    applyLighting(this.uniforms, light)
    this.buildParts()
    this.buildLabels(
      shelves.map((shelf) => shelf.label),
      light,
    )
    this.buildBoxes()
    this.frame3d()

    const count = this.games.length
    this.forward = new Float32Array(count)
    this.forwardTarget = new Float32Array(count)
    this.slideFrom = new Float32Array(count * 2)
    this.sliding = false
    this.moving.clear()
    for (const [at, game] of this.games.entries()) {
      this.forward[at] = this.forwardTarget[at] = game.status === 'playing' ? FORWARD.playing : 0
      const from = before.get(game.key)
      const box = this.layout.boxes[at]!
      if (from && !this.options.calm && (from.x !== box.x || from.y !== box.y)) {
        this.slideFrom[at * 2] = from.x - box.x
        this.slideFrom[at * 2 + 1] = from.y - box.y
        this.sliding = true
      }
    }
    this.slideStart = performance.now()
    this.hot =
      hotKey === undefined ? undefined : this.games.findIndex((game) => game.key === hotKey)
    if (this.hot === -1) this.hot = undefined
    if (this.hot !== undefined) this.forwardTarget[this.hot] = FORWARD.hot
    for (let at = 0; at < count; at += 1) this.placeBox(at)
    this.markAll()
    this.coversAt = Number.NaN
    this.invalidate()
  }

  private clearRoom(): void {
    for (const object of this.room) {
      this.scene.remove(object)
      const mesh = object as Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as ShaderMaterial | undefined)?.dispose()
    }
    this.room = []
    for (const shape of this.shapes.values()) {
      this.scene.remove(shape.mesh)
      shape.geometry.dispose()
      ;(shape.mesh.material as ShaderMaterial).dispose()
    }
    this.shapes.clear()
    for (const texture of this.spines) texture.dispose()
    this.spines = []
    this.labels?.dispose()
    this.labels = undefined
    this.unpullNow()
  }

  private add(object: Object3D): void {
    this.scene.add(object)
    this.room.push(object)
  }

  /** The wall, the ledges, the uprights between bays, the LED bars, and the glow they throw. */
  private buildParts(): void {
    const { layout } = this
    const top = Math.max(layout.top, FLOOR + 900) + 200
    const wall = new Mesh(new PlaneGeometry(1, 1), wallMaterial(this.uniforms, top))
    const span = layout.x1 - layout.x0 + 12_000
    wall.scale.set(span, top + 1200, 1)
    wall.position.set((layout.x0 + layout.x1) / 2, (top + 1200) / 2 - 400, 0)
    this.add(wall)

    // Every bay has all its ledges, whether or not anything stands on them.
    type Part = {
      x: number
      y: number
      z: number
      w: number
      h: number
      d: number
      kind: number
      ledge: number
    }
    const parts: Part[] = []
    const glows: { x: number; y: number; w: number; h: number; ledge: number }[] = []
    let extra = layout.ledges.length
    const bays = new Map<string, number>()
    for (const [at, ledge] of layout.ledges.entries())
      bays.set(`${ledge.shelf}:${ledge.bay}:${ledge.y}`, at)

    layout.shelves.forEach((shelf, index) => {
      const pitch = layout.pitches[index]!
      for (let bay = 0; bay < shelf.bays; bay += 1) {
        const x0 = shelf.x0 + bay * (BAY_WIDTH + BAY_GAP)
        for (let level = 0; level < LEDGES_PER_BAY; level += 1) {
          const y = FLOOR + level * pitch
          const ledge = bays.get(`${index}:${bay}:${y}`) ?? extra++
          parts.push({
            x: x0 + BAY_WIDTH / 2,
            y: y - LEDGE_THICKNESS / 2,
            z: LEDGE_DEPTH / 2,
            w: BAY_WIDTH + 24,
            h: LEDGE_THICKNESS,
            d: LEDGE_DEPTH,
            kind: PART_LEDGE,
            ledge,
          })
          parts.push({
            x: x0 + BAY_WIDTH / 2,
            y: y + 3,
            z: 10,
            w: BAY_WIDTH - 20,
            h: 6,
            d: 8,
            kind: PART_BAR,
            ledge,
          })
          glows.push({ x: x0 + BAY_WIDTH / 2, y, w: BAY_WIDTH + 160, h: pitch * 0.95, ledge })
        }
      }
      // An upright at each side of every bay, floor to the top of the shelf.
      const height = FLOOR + LEDGES_PER_BAY * pitch
      for (let edge = 0; edge <= shelf.bays; edge += 1) {
        const x =
          shelf.x0 +
          edge * (BAY_WIDTH + BAY_GAP) -
          (edge === 0 ? 24 : edge === shelf.bays ? BAY_GAP - 24 : BAY_GAP / 2)
        parts.push({
          x,
          y: height / 2,
          z: LEDGE_DEPTH / 2,
          w: 32,
          h: height,
          d: LEDGE_DEPTH,
          kind: PART_UPRIGHT,
          ledge: 0,
        })
      }
    })

    this.uniforms.uLedges.value.dispose()
    this.uniforms.uLedges.value = ledgeTexture(extra)
    this.ledColor = new Float32Array(extra * 3)
    this.ledTarget = new Float32Array(extra * 3)
    for (let ledge = 0; ledge < extra; ledge += 1) this.setLed(ledge, this.restingLed, true)

    const geometry = new BoxGeometry(1, 1, 1)
    const kind = instanced(parts.length, 1)
    const ledgeOf = instanced(parts.length, 1)
    geometry.setAttribute('aKind', kind)
    geometry.setAttribute('aLedge', ledgeOf)
    const mesh = new InstancedMesh(geometry, partMaterial(this.uniforms), parts.length)
    parts.forEach((part, at) => {
      this.dummy.position.set(part.x, part.y, part.z)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.set(part.w, part.h, part.d)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(at, this.dummy.matrix)
      kind.setX(at, part.kind)
      ledgeOf.setX(at, part.ledge)
    })
    mesh.frustumCulled = false
    this.add(mesh)

    const glowGeometry = new PlaneGeometry(1, 1)
    glowGeometry.translate(0, 0.5, 0)
    const glowLedge = instanced(glows.length, 1)
    glowGeometry.setAttribute('aLedge', glowLedge)
    const glow = new InstancedMesh(glowGeometry, glowMaterial(this.uniforms), glows.length)
    glows.forEach((part, at) => {
      this.dummy.position.set(part.x, part.y, 1)
      this.dummy.scale.set(part.w, part.h, 1)
      this.dummy.updateMatrix()
      glow.setMatrixAt(at, this.dummy.matrix)
      glowLedge.setX(at, part.ledge)
    })
    glow.frustumCulled = false
    glow.renderOrder = 1
    this.add(glow)
  }

  private buildLabels(labels: readonly LabelText[], light: Lighting): void {
    const maxSize = this.renderer.capabilities.maxTextureSize
    const { texture, cells } = drawLabels(
      labels,
      { text: light.text, muted: light.textMuted, marker: light.marker },
      this.options.fonts,
      Math.min(4096, maxSize),
    )
    this.labels = texture
    const geometry = new PlaneGeometry(1, 1)
    // Anchored at the left of the label's baseline area.
    geometry.translate(0.5, 0.5, 0)
    const cell = instanced(cells.length, 4)
    geometry.setAttribute('aCell', cell)
    const mesh = new InstancedMesh(
      geometry,
      labelMaterial(this.uniforms, texture),
      Math.max(1, cells.length),
    )
    mesh.count = cells.length
    cells.forEach((placed, at) => {
      const shelf = this.layout.shelves[at]!
      // On the front of the unit, above its top ledge, where an upright cannot hide it.
      this.dummy.position.set(shelf.labelX + 36, shelf.labelY + 18, LEDGE_DEPTH + 1)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.set(placed.aspect * LABEL_HEIGHT, LABEL_HEIGHT, 1)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(at, this.dummy.matrix)
      cell.setXYZW(at, placed.u, placed.v, placed.width, placed.height)
    })
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    this.labelMesh = mesh
    this.add(mesh)
  }

  private textures(): BoxTextures {
    return {
      covers: Array.from({ length: COVER_PAGES }, (_, at) => this.covers.pages[at] ?? this.blank),
      coverCell: this.covers.cell,
      own: this.blank,
      spines: Array.from({ length: SPINE_PAGES }, (_, at) => this.spines[at] ?? this.blank),
      spineCell: [SPINE.width / 2048, SPINE.height / 2048],
      digits: this.digits,
    }
  }

  /** One instanced mesh per case shape: about ten draws for any number of games. */
  private buildBoxes(): void {
    if (this.standing === 'compact') {
      const { textures, cells } = drawSpines(
        this.games.map((game) => game.spine),
        this.options.fonts,
        SPINE_PAGES,
      )
      this.spines = textures
      this.spineCells = cells
    } else {
      this.spineCells = []
    }

    const byShape = new Map<CaseShape, number[]>()
    this.layout.boxes.forEach((box, at) => {
      const list = byShape.get(box.shape) ?? []
      list.push(at)
      byShape.set(box.shape, list)
    })
    this.where = new Array(this.layout.boxes.length)
    this.byCover.clear()
    const textures = this.textures()

    for (const [shape, boxes] of byShape) {
      const { width, height } = caseShapes[shape]
      const depth = caseDepths[shape]
      const geometry = new BoxGeometry(width, height, depth)
      const count = boxes.length
      const attributes = {
        wash0: instanced(count, 3),
        wash1: instanced(count, 3),
        wash2: instanced(count, 3),
        plastic: instanced(count, 3),
        cover: instanced(count, 4, true),
        state: instanced(count, 4, true),
        spine: instanced(count, 4),
        ledge: instanced(count, 1),
      }
      geometry.setAttribute('aWash0', attributes.wash0)
      geometry.setAttribute('aWash1', attributes.wash1)
      geometry.setAttribute('aWash2', attributes.wash2)
      geometry.setAttribute('aPlastic', attributes.plastic)
      geometry.setAttribute('aCover', attributes.cover)
      geometry.setAttribute('aState', attributes.state)
      geometry.setAttribute('aSpine', attributes.spine)
      geometry.setAttribute('aLedge', attributes.ledge)
      const mesh = new InstancedMesh(
        geometry,
        boxMaterial(this.uniforms, textures, [width, height, depth]),
        count,
      )
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.frustumCulled = false
      const entry: ShapeMesh = { mesh, geometry, boxes, attributes }
      boxes.forEach((box, instance) => {
        this.where[box] = { shape, instance }
        const game = this.games[box]!
        const placed = this.layout.boxes[box]!
        attributes.wash0.setXYZ(instance, ...game.wash[0])
        attributes.wash1.setXYZ(instance, ...game.wash[1])
        attributes.wash2.setXYZ(instance, ...game.wash[2])
        attributes.plastic.setXYZ(instance, ...game.plastic)
        attributes.ledge.setX(instance, placed.ledge)
        const spine = this.spineCells[box]
        attributes.spine.setXYZW(
          instance,
          spine && spine.page >= 0 ? 1 : 0,
          spine?.page ?? 0,
          spine?.u ?? 0,
          spine?.v ?? 0,
        )
        if (game.cover) {
          const list = this.byCover.get(game.cover) ?? []
          list.push(box)
          this.byCover.set(game.cover, list)
        }
      })
      this.shapes.set(shape, entry)
      this.scene.add(mesh)
    }
  }

  /** Writes a box's matrix and its state, from where it stands and what it is doing. */
  private placeBox(at: number, now = performance.now()): void {
    const where = this.where[at]
    const box = this.layout.boxes[at]
    const game = this.games[at]
    const entry = where && this.shapes.get(where.shape)
    if (!where || !entry || !box || !game) return
    const forward = this.forward[at] ?? 0
    // How far toward "in focus" it is, so its glow fades as it goes back.
    const hot = Math.min(
      1,
      Math.max(0, (forward - FORWARD.playing) / (FORWARD.hot - FORWARD.playing)),
    )

    let dx = 0
    let dy = 0
    if (this.sliding) {
      const progress = curve('settle')(Math.min(1, (now - this.slideStart) / duration.slow))
      dx = (this.slideFrom[at * 2] ?? 0) * (1 - progress)
      dy = (this.slideFrom[at * 2 + 1] ?? 0) * (1 - progress)
    }

    const { height } = caseShapes[where.shape]
    const depth = caseDepths[where.shape]
    const lift = hot * 6
    const scale = 1 + (game.status === 'playing' ? 0.05 : 0) + hot * 0.04
    const sx = game.coverOnly ? COVER_ONLY_SCALE.width : 1
    const sy = game.coverOnly ? COVER_ONLY_SCALE.height : 1
    const sz = game.coverOnly ? COVER_ONLY_DEPTH / depth : 1
    const centerY = box.y + (height * sy * scale) / 2 + lift
    const zFront = BACK_GAP + box.depth / 2 + forward

    this.dummy.scale.set(sx * scale, sy * scale, sz * scale)
    this.dummy.rotation.set(0, this.standing === 'compact' ? -Math.PI / 2 : 0, 0)
    this.dummy.position.set(box.x + dx, centerY + dy, zFront)
    if (game.status === 'dropped' && at !== this.pull.box) {
      // Leans on its neighbor, turning about its bottom right corner.
      const pivotX = box.x + box.width / 2
      const pivotY = box.y
      const offX = box.x - pivotX
      const offY = centerY - pivotY
      this.dummy.position.set(
        pivotX + offX * Math.cos(LEAN) - offY * Math.sin(LEAN) + dx,
        pivotY + offX * Math.sin(LEAN) + offY * Math.cos(LEAN) + dy,
        zFront,
      )
      this.dummy.rotation.set(0, this.standing === 'compact' ? -Math.PI / 2 : 0, LEAN, 'ZYX')
    }
    if (at === this.pull.box) this.dummy.scale.set(0, 0, 0)
    this.dummy.updateMatrix()
    entry.mesh.setMatrixAt(where.instance, this.dummy.matrix)

    const place = game.cover ? this.covers.place(game.cover) : undefined
    entry.attributes.cover.setXYZW(
      where.instance,
      place ? 1 : 0,
      place?.page ?? 0,
      place?.u ?? 0,
      place?.v ?? 0,
    )
    entry.attributes.state.setXYZW(
      where.instance,
      STATUS_CODE[game.status],
      game.coverOnly ? 1 : 0,
      this.standing === 'covers' ? game.owned : 0,
      hot,
    )
  }

  private markAll(): void {
    for (const entry of this.shapes.values()) {
      entry.mesh.instanceMatrix.needsUpdate = true
      entry.attributes.cover.needsUpdate = true
      entry.attributes.state.needsUpdate = true
      entry.attributes.wash0.needsUpdate = true
      entry.attributes.wash1.needsUpdate = true
      entry.attributes.wash2.needsUpdate = true
      entry.attributes.plastic.needsUpdate = true
      entry.attributes.spine.needsUpdate = true
      entry.attributes.ledge.needsUpdate = true
    }
  }

  private markBox(at: number): void {
    const where = this.where[at]
    const entry = where && this.shapes.get(where.shape)
    if (!entry) return
    entry.mesh.instanceMatrix.needsUpdate = true
    entry.attributes.state.needsUpdate = true
    entry.attributes.cover.needsUpdate = true
  }

  private coverPlaced(id: string): void {
    for (const at of this.byCover.get(id) ?? []) {
      this.placeBox(at)
      this.markBox(at)
    }
    this.invalidate()
  }

  /* -------------------------------------------------------------- light */

  setLighting(light: Lighting, labels?: readonly LabelText[]): void {
    applyLighting(this.uniforms, light)
    const resting = this.restingLed
    this.restingLed = light.led
    // Ledges at rest follow the new resting color.
    const count = this.ledColor.length / 3
    for (let ledge = 0; ledge < count; ledge += 1) {
      const target = this.ledTarget.subarray(ledge * 3, ledge * 3 + 3)
      if (target[0] === resting[0] && target[1] === resting[1] && target[2] === resting[2]) {
        this.setLed(ledge, light.led, true)
      }
    }
    if (labels) {
      // Labels are drawn in the theme's ink, so a theme change draws them again.
      const old = this.labelMesh
      if (old) {
        this.scene.remove(old)
        this.room = this.room.filter((object) => object !== old)
        old.geometry.dispose()
        ;(old.material as ShaderMaterial).dispose()
      }
      this.labels?.dispose()
      this.buildLabels(labels, light)
    }
    this.invalidate()
  }

  private setLed(ledge: number, color: Rgb, now = false): void {
    this.ledTarget.set(color, ledge * 3)
    if (now || this.options.calm) {
      this.ledColor.set(color, ledge * 3)
      writeLedge(this.uniforms.uLedges.value, ledge, color)
    }
  }

  /* ---------------------------------------------------- hover, focus, pull */

  /** The box under the pointer or in focus: it comes forward, and its ledge's LED takes its color. */
  setHot(box?: number): void {
    if (box === this.hot) return
    const previous = this.hot
    if (previous !== undefined) {
      const game = this.games[previous]
      this.forwardTarget[previous] = game?.status === 'playing' ? FORWARD.playing : 0
      this.moving.add(previous)
      const ledge = this.layout.boxes[previous]?.ledge
      if (ledge !== undefined) this.setLed(ledge, this.restingLed)
    }
    this.hot = box
    // Spine-out, the box under the pointer is the one whose cover may be wanted.
    if (this.standing === 'compact') this.coversAt = Number.NaN
    if (box !== undefined && this.games[box]) {
      this.forwardTarget[box] = FORWARD.hot
      this.moving.add(box)
      const ledge = this.layout.boxes[box]!.ledge
      this.setLed(ledge, this.games[box]!.led)
    }
    this.invalidate()
  }

  get hotBox(): number | undefined {
    return this.hot
  }

  /**
   * Pulls a box out: it slides toward you and turns to face you, the camera
   * moves in, and the wall behind dims. `avoidRight` is the width a panel
   * takes on the right, so the box stays beside it, not under it.
   */
  setPulled(box: number | undefined, avoidRight = 0): void {
    if (box === this.pulled) return
    this.pulled = box
    this.avoidRight = avoidRight
    if (box === undefined) {
      this.pull.target = 0
    } else {
      this.unpullNow()
      this.pull = { amount: 0, target: 1, box }
      this.makePullMesh(box)
      this.placeBox(box)
      this.markBox(box)
    }
    this.invalidate()
  }

  private makePullMesh(at: number): void {
    const game = this.games[at]!
    const { width, height } = caseShapes[game.shape]
    const depth = caseDepths[game.shape]
    const geometry = new BoxGeometry(width, height, depth)
    const attributes: Record<string, [number, number[]]> = {
      aWash0: [3, game.wash[0]],
      aWash1: [3, game.wash[1]],
      aWash2: [3, game.wash[2]],
      aPlastic: [3, game.plastic],
      aCover: [4, [0, 0, 0, 0]],
      aState: [4, [STATUS_CODE[game.status], game.coverOnly ? 1 : 0, game.owned, 1]],
      aSpine: [4, [0, 0, 0, 0]],
      aLedge: [1, [this.layout.boxes[at]!.ledge]],
    }
    for (const [name, [size, values]] of Object.entries(attributes)) {
      const attribute = instanced(1, size)
      attribute.array.set(values)
      geometry.setAttribute(name, attribute)
    }
    const place = game.cover ? this.covers.place(game.cover) : undefined
    if (place)
      (geometry.getAttribute('aCover').array as Float32Array).set([1, place.page, place.u, place.v])
    const material = boxMaterial(this.uniforms, this.textures(), [width, height, depth], false)
    const mesh = new InstancedMesh(geometry, material, 1)
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    this.scene.add(mesh)
    const abort = new AbortController()
    this.pullMesh = { mesh, material, abort }
    if (game.cover) {
      void this.covers.own(game.cover, abort.signal).then((texture) => {
        if (!texture || abort.signal.aborted || !this.pullMesh || this.pullMesh.mesh !== mesh) {
          texture?.dispose()
          return
        }
        this.pullMesh.own = texture
        material.uniforms.uOwn!.value = texture
        ;(geometry.getAttribute('aCover').array as Float32Array)[0] = 2
        geometry.getAttribute('aCover').needsUpdate = true
        this.invalidate()
      })
    }
  }

  private unpullNow(): void {
    if (this.pullMesh) {
      this.pullMesh.abort?.abort()
      this.scene.remove(this.pullMesh.mesh)
      this.pullMesh.mesh.geometry.dispose()
      this.pullMesh.material.dispose()
      this.pullMesh.own?.dispose()
      this.pullMesh = undefined
    }
    const box = this.pull.box
    this.pull = { amount: 0, target: 0, box: -1 }
    this.uniforms.uDim.value = 0
    if (box >= 0) {
      this.placeBox(box)
      this.markBox(box)
    }
  }

  private placePulled(): void {
    const { box: at, amount } = this.pull
    const mesh = this.pullMesh?.mesh
    const box = this.layout.boxes[at]
    const game = this.games[at]
    if (!mesh || !box || !game) return
    const eased = curve('glide')(amount)
    const { height } = caseShapes[game.shape]
    const start = new Vector3(box.x, box.y + height / 2, BACK_GAP + box.depth / 2)
    const out = new Vector3(box.x, this.middle + 40, PULL_OUT)
    const position = start.lerp(out, eased)
    // It turns to face the camera, wherever the camera is.
    const facing = Math.atan2(
      this.camera.position.x - position.x,
      this.camera.position.z - position.z,
    )
    const startTurn = this.standing === 'compact' ? -Math.PI / 2 : 0
    this.dummy.position.copy(position)
    this.dummy.rotation.set(0, startTurn + (facing - startTurn) * eased, 0)
    const scale = game.coverOnly
      ? [COVER_ONLY_SCALE.width, COVER_ONLY_SCALE.height, COVER_ONLY_DEPTH / caseDepths[game.shape]]
      : [1, 1, 1]
    this.dummy.scale.set(scale[0]!, scale[1]!, scale[2]!)
    this.dummy.updateMatrix()
    mesh.setMatrixAt(0, this.dummy.matrix)
    mesh.instanceMatrix.needsUpdate = true
  }

  /* ------------------------------------------------------------ camera */

  /** Where the camera stands back to, and its limits, for the canvas's shape. */
  private frame3d(): void {
    const { layout } = this
    const aspect = this.width / this.height
    const bottom = FLOOR - 90
    const top = Math.max(layout.top, FLOOR + 600) + LABEL_HEIGHT + 50
    this.middle = (bottom + top) / 2
    const tall = top - bottom
    // Far enough back to see the bays' full height, and at least one bay across.
    this.distance = Math.max(distanceFor(tall), distanceFor((BAY_WIDTH + 260) / aspect))
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    const seen = visibleWidth(this.distance, aspect)
    const { min, max } = limits(layout.x0, layout.x1, seen, 200)
    if (this.rig.min === 0 && this.rig.max === 0) this.rig = createRig(min, min, max)
    else relimit(this.rig, min, max)
    this.fitCovers()
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.renderer.setSize(this.width, this.height, false)
    this.frame3d()
    this.invalidate()
  }

  /** Walks the camera to a place on the wall. */
  aimAt(x: number): void {
    aim(this.rig, x)
    this.invalidate()
  }

  /** Puts the camera at a place on the wall at once, with no walk: before the first frame. */
  jumpTo(x: number): void {
    aim(this.rig, x)
    this.rig.x = this.rig.target
    this.invalidate()
  }

  /** Walks the camera by a distance, as the wheel and a drag do. */
  nudgeBy(distance: number): void {
    nudge(this.rig, distance)
    this.invalidate()
  }

  /** Brings a box into view, if it is not well inside it already. */
  showBox(at: number): void {
    const box = this.layout.boxes[at]
    if (!box) return
    const seen = visibleWidth(this.distance, this.width / this.height)
    const margin = Math.min(seen * 0.3, 500)
    if (Math.abs(box.x - this.rig.target) > seen / 2 - margin) this.aimAt(box.x)
  }

  /** Walks to a shelf: its first bay, from its left edge. */
  showShelf(shelf: number): void {
    const placed = this.layout.shelves[shelf]
    if (!placed) return
    const seen = visibleWidth(this.distance, this.width / this.height)
    this.aimAt(placed.x0 + Math.min(seen, placed.x1 - placed.x0) / 2 - 100)
  }

  /** How far along the wall one CSS pixel on screen is. */
  get pixelsToWall(): number {
    return visibleWidth(this.distance, this.width / this.height) / this.width
  }

  get cameraX(): number {
    return this.rig.x
  }

  get room3d(): RoomLayout {
    return this.layout
  }

  /** The box nearest the middle of the view. */
  middleBox(): number | undefined {
    let best: number | undefined
    let distance = Infinity
    for (const [at, box] of this.layout.boxes.entries()) {
      const d =
        Math.abs(box.x - this.rig.target) + Math.abs(box.y + box.height / 2 - this.middle) * 0.5
      if (d < distance) {
        distance = d
        best = at
      }
    }
    return best
  }

  /**
   * The flat pose (1) is the wall seen straight on with no depth, as the 2D
   * shelf is; full 3D (0) has the camera a little low, the wall leaning back,
   * and the boxes standing out of it. The switch plays between them.
   */
  flatten(to: 0 | 1, length: number): void {
    this.flat = {
      amount: this.flat.amount,
      from: this.flat.amount,
      to,
      start: performance.now(),
      length,
    }
    if (length <= 0 || this.options.calm) this.flat.amount = to
    this.invalidate()
  }

  /** Starts flat, for the switch into 3D. */
  startFlat(): void {
    this.flat = { amount: 1, from: 1, to: 1, start: 0, length: 0 }
  }

  private placeCamera(): void {
    const flat = this.flat.amount
    const pull = curve('glide')(this.pull.amount)
    const panel = this.avoidRight * this.pixelsToWall * PULL_DOLLY
    const pulled = this.layout.boxes[this.pull.box]
    const pullX = pulled ? pulled.x + panel / 2 : this.rig.x
    const x = this.rig.x + (pullX - this.rig.x) * pull
    const distance = this.distance * (1 - (1 - PULL_DOLLY) * pull)
    const lift = TILT.lift * (1 - flat) * (1 - pull)
    const look = TILT.look * (1 - flat) * (1 - pull)
    const y = this.middle + lift + 40 * pull
    this.camera.position.set(x, y, distance + PULL_OUT * pull * 0.2)
    this.camera.lookAt(x, this.middle + look, 0)
    this.camera.updateMatrixWorld()
    this.uniforms.uFlat.value = flat
    this.uniforms.uDim.value = pull
  }

  /* ------------------------------------------------------------ picking */

  /** The box under a point on the canvas, in CSS pixels from its top left. */
  pick(x: number, y: number): number | undefined {
    const ndc = new Vector3((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1, 0.5)
    ndc.unproject(this.camera)
    const direction = ndc.sub(this.camera.position).normalize()
    // Where the ray meets the plane of the boxes' fronts.
    const front =
      BACK_GAP + (this.standing === 'compact' ? caseShapes.bluRay.width : caseDepths.bluRay)
    const t = (front - this.camera.position.z) / direction.z
    if (!(t > 0)) return undefined
    const hit = this.camera.position.clone().add(direction.multiplyScalar(t))
    return boxAt(this.layout, hit.x, hit.y)
  }

  /** Where a box is on the canvas, in CSS pixels, for the focus ring and the label. */
  boxRect(at: number): { x: number; y: number; width: number; height: number } | undefined {
    const box = this.layout.boxes[at]
    if (!box) return undefined
    const forward = this.forward[at] ?? 0
    const z = BACK_GAP + box.depth + forward
    const corners = [
      new Vector3(box.x - box.width / 2, box.y, z),
      new Vector3(box.x + box.width / 2, box.y + box.height, z),
    ].map((corner) => {
      corner.z = 24 + (corner.z - 24) * (1 - 0.96 * this.flat.amount)
      corner.project(this.camera)
      return { x: ((corner.x + 1) / 2) * this.width, y: ((1 - corner.y) / 2) * this.height }
    })
    const [a, b] = corners as [{ x: number; y: number }, { x: number; y: number }]
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    }
  }

  /* ------------------------------------------------------------- frames */

  /** Asks for a frame. Frames are drawn only when something changes: an idle shelf uses no GPU. */
  invalidate(): void {
    if (this.disposed || this.raf) return
    if (!this.last) this.last = performance.now() - 16
    this.raf = requestAnimationFrame(this.draw)
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private draw = (now: number): void => {
    this.raf = 0
    if (this.disposed) return
    const elapsed = now - this.last
    const seconds = Math.min(0.1, Math.max(0, elapsed / 1000))
    this.last = now
    const calm = this.options.calm
    let moving = step(this.rig, seconds, calm)

    // Boxes coming forward or going back.
    for (const at of this.moving) {
      const target = this.forwardTarget[at] ?? 0
      const current = this.forward[at] ?? 0
      const next =
        calm || settled(current, target, 0.2) ? target : damp(current, target, 14, seconds)
      this.forward[at] = next
      this.placeBox(at, now)
      this.markBox(at)
      if (next === target) this.moving.delete(at)
      else moving = true
    }

    // A regroup's slide.
    if (this.sliding) {
      for (let at = 0; at < this.games.length; at += 1) {
        if (this.slideFrom[at * 2] || this.slideFrom[at * 2 + 1]) this.placeBox(at, now)
      }
      this.markAll()
      if (now - this.slideStart >= duration.slow) this.sliding = false
      else moving = true
    }

    // The LEDs gliding to their colors.
    const ledges = this.ledColor.length / 3
    for (let ledge = 0; ledge < ledges; ledge += 1) {
      let changed = false
      for (let channel = 0; channel < 3; channel += 1) {
        const i = ledge * 3 + channel
        const target = this.ledTarget[i]!
        const current = this.ledColor[i]!
        if (current === target) continue
        const next = settled(current, target, 0.002)
          ? target
          : damp(current, target, (1000 / duration.slow) * 2.2, seconds)
        this.ledColor[i] = next
        changed = true
      }
      if (changed) {
        writeLedge(this.uniforms.uLedges.value, ledge, [
          this.ledColor[ledge * 3]!,
          this.ledColor[ledge * 3 + 1]!,
          this.ledColor[ledge * 3 + 2]!,
        ])
        moving = true
      }
    }

    // Pulling a box out, or putting it back.
    if (this.pull.box >= 0) {
      const { amount, target } = this.pull
      const next = calm
        ? target
        : settled(amount, target, 0.004)
          ? target
          : damp(amount, target, 7, seconds)
      this.pull.amount = next
      this.placePulled()
      if (next !== target) moving = true
      else if (target === 0) this.unpullNow()
    }

    // The switch between flat and full depth.
    if (this.flat.amount !== this.flat.to) {
      const progress =
        this.flat.length > 0 ? Math.min(1, (now - this.flat.start) / this.flat.length) : 1
      this.flat.amount = this.flat.from + (this.flat.to - this.flat.from) * curve('glide')(progress)
      if (progress < 1) moving = true
    }

    this.placeCamera()
    this.wantCovers()
    this.renderer.render(this.scene, this.camera)
    this.frames += 1
    this.judge(elapsed, moving)
    const stats = this.stats()
    this.options.onFrame?.(stats)
    // A test reads the numbers by setting the probe before the page loads.
    if (window.__shelf3dProbe) window.__shelf3dProbe = stats
    if (moving) this.invalidate()
    else this.last = 0
  }

  /**
   * Which covers to have: those of the boxes in view and either side of it,
   * nearest the middle first. Spine-out, only the box under the pointer
   * shows its cover, and only once it is pulled out and turned.
   */
  private wantCovers(): void {
    const x = this.rig.x
    if (Math.abs(x - this.coversAt) < 120) return
    this.coversAt = x
    if (this.standing === 'compact') {
      const cover = this.hot === undefined ? undefined : this.games[this.hot]?.cover
      this.covers.want(cover ? [cover] : [])
      return
    }
    const seen = visibleWidth(this.distance, this.width / this.height)
    const near: { id: string; d: number }[] = []
    for (const [at, box] of this.layout.boxes.entries()) {
      const d = Math.abs(box.x - x)
      const id = this.games[at]?.cover
      if (id && d < seen * 1.25) near.push({ id, d })
    }
    near.sort((a, b) => a.d - b.d)
    this.covers.want([...new Set(near.map((entry) => entry.id))])
  }

  /**
   * Sizes the atlas's cells to the covers as they appear: the widest case
   * front in the room, a little more for a box that comes forward, in the
   * pixels the canvas draws. The file is chosen at the screen's own density,
   * as the 2D shelf chooses it.
   */
  private fitCovers(): void {
    let widest = 0
    for (const game of this.games) {
      const { width } = caseShapes[game.shape]
      widest = Math.max(widest, game.coverOnly ? width * COVER_ONLY_SCALE.width : width)
    }
    if (!widest) return
    const seen = visibleWidth(this.distance, this.width / this.height)
    const across = ((widest * this.width) / seen) * HOT_GROWTH
    this.covers.fit(across * this.pixelRatio, across * (window.devicePixelRatio || 1))
    this.coversAt = Number.NaN
  }

  /**
   * Watches frames while something moves. If they stay slow, the resolution
   * steps down; if they are still slow at the lowest, the scene gives up and
   * the page goes back to 2D (spec 3.3).
   */
  private judge(elapsed: number, moving: boolean): void {
    if (!moving || elapsed <= 0 || elapsed > 500) {
      this.recent = []
      return
    }
    this.recent.push(elapsed)
    if (elapsed > SLOW_FRAME_MS) this.slowFrames += 1
    if (this.recent.length < JUDGE_FRAMES) return
    const sorted = this.recent.toSorted((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    this.recent = []
    if (median <= SLOW_FRAME_MS) return
    const at = PIXEL_RATIOS.findIndex((ratio) => ratio < this.pixelRatio - 0.01)
    if (at >= 0) {
      this.pixelRatio = PIXEL_RATIOS[at]!
      this.renderer.setPixelRatio(this.pixelRatio)
      this.renderer.setSize(this.width, this.height, false)
    } else {
      this.stop()
      this.options.onSlow()
    }
  }

  stats(): SceneStats {
    const info = this.renderer.info
    let bytes = this.covers.bytes
    for (const texture of this.spines) {
      const image = texture.image as { width: number; height: number }
      bytes += image.width * image.height * 4
    }
    return {
      frames: this.frames,
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      textureBytes: bytes,
      boxes: this.layout.boxes.length,
      pixelRatio: this.pixelRatio,
      cameraX: this.rig.x,
      hot: this.hot,
      pulled: this.pulled,
      slowFrames: this.slowFrames,
    }
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.canvas.removeEventListener('webglcontextlost', this.lost)
    this.clearRoom()
    this.covers.dispose()
    this.digits.dispose()
    this.blank.dispose()
    this.uniforms.uLedges.value.dispose()
    this.renderer.dispose()
  }
}

declare global {
  interface Window {
    /** Set to an object by a test, before the page loads, to read the scene's numbers after each frame. */
    __shelf3dProbe?: SceneStats | Record<string, never>
  }
}
