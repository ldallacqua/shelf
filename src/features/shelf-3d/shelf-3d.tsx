'use client'

import { useTranslations } from 'next-intl'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { fromHex, ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { describeBox, shelfName } from '@/features/library/describe'
import { platformFor, platformsOwned } from '@/features/library/game-box'
import type { Density } from '@/features/library/preferences'
import type { DrawnShelf, OpenBox } from '@/features/library/view-props'

import { wheelDistance } from './camera-rig'
import { fontsReady, readFonts, type LabelText } from './labels'
import { boxIndexOf } from './layout'
import { ShelfScene, type SceneShelf, type SceneStats } from './scene'
import { readLighting, type Lighting, type Rgb } from './tokens'

import './shelf-3d.css'

/** Why 3D gave way to 2D. The page says so in one line (spec 3.3). */
export type FallbackReason = 'unsupported' | 'lost' | 'slow'

/** The game a switch keeps on screen: by its key, and whether it had focus. */
export type Anchor = { key: string; focus: boolean }

export type Shelf3DHandle = {
  /** The game to keep on screen when switching away: the focused one, or the one nearest the middle. */
  anchor: () => Anchor | undefined
  /** Plays the switch out: the wall flattens. Resolves when it has. */
  leave: () => Promise<void>
  /** Undoes a switch out that was changed back before it ended. */
  stay: () => void
}

export type Shelf3DProps = {
  shelves: readonly DrawnShelf[]
  platforms: ReadonlyMap<number, LibraryPlatform>
  density: Density
  open?: OpenBox
  onOpen: (box: OpenBox) => void
  /** The game to start at, from the view being left. */
  anchor?: Anchor
  /** The first frame is drawn: the 3D shelf can be shown. */
  onLive: () => void
  onFallback: (reason: FallbackReason) => void
  /** The page has made the 3D shelf the one to use: until then it cannot take focus. */
  interactive: boolean
  /** Filled in with what the page can ask of the 3D shelf. */
  handleRef: { current: Shelf3DHandle | undefined }
}

/** How long the wall takes to lean back and the boxes to gain depth (spec 3.6). */
const SWITCH_MS = 700
/** A pointer that moves further than this between press and release was dragging, not clicking. */
const DRAG_SLOP = 5
/** The game panel's width, which a pulled box keeps clear of: 26rem, and 32rem on a large screen. */
const panelWidth = (): number =>
  window.matchMedia('(min-width: 64rem)').matches
    ? 512
    : window.matchMedia('(min-width: 40rem)').matches
      ? 416
      : 0

const keyOf = (item: ShelfItem) =>
  item.copy ? `${item.game.slug}:${item.copy.platform}` : item.game.slug

const rgb = (hex: string): Rgb => fromHex(hex).map((channel) => channel / 255) as Rgb

/** The scene's view of the shelves: shapes, colors and marks, decided as the 2D box decides them. */
const toScene = (
  shelves: readonly DrawnShelf[],
  platforms: ReadonlyMap<number, LibraryPlatform>,
  light: Lighting,
  label: (shelf: DrawnShelf) => LabelText,
): SceneShelf[] =>
  shelves.map((shelf) => ({
    label: label(shelf),
    games: shelf.items.map((item) => {
      const { game, copy } = item
      const platform = platformFor(item, platforms)
      const plastic = light.plastics[platform?.plastic ?? 'black']
      const colors = game.colors
      const wash: [Rgb, Rgb, Rgb] = colors
        ? [rgb(colors[0]), rgb(colors[1]), rgb(colors[2])]
        : [plastic, plastic, light.ledge]
      return {
        key: keyOf(item),
        shape: platform?.shape ?? 'keepCase',
        // A download has no case around it. A wishlist game keeps its outline.
        coverOnly: copy?.format === 'digital' && game.status !== 'wishlist',
        status: game.status,
        owned: platformsOwned(item),
        cover: copy?.cover ?? game.cover,
        wash,
        plastic,
        led: colors ? rgb(ledFrom(colors[0])) : light.led,
        spine: { title: game.title, color: colors ? rgb(colors[2]) : plastic, band: plastic },
      }
    }),
  }))

/**
 * The shelf in 3D: a game room's display wall, walked along sideways
 * (spec 3.3). Loaded only the first time 3D opens.
 *
 * The canvas is hidden from assistive technology. Beside it are the same
 * shelves as labeled lists of buttons, in the same order, with the same
 * names as the 2D boxes: keyboard and screen-reader users work the lists,
 * and the scene follows. A click in the scene moves focus in the lists.
 */
export default function Shelf3D({
  shelves,
  platforms,
  density,
  open,
  onOpen,
  anchor,
  onLive,
  onFallback,
  interactive,
  handleRef,
}: Shelf3DProps) {
  const t = useTranslations('Library')
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLDivElement>(null)
  const lists = useRef<HTMLDivElement>(null)
  const scene = useRef<ShelfScene | undefined>(undefined)
  const [ready, setReady] = useState(false)
  /** The shelf the camera is at, for the index. */
  const [current, setCurrent] = useState(0)
  /** The box Tab stops at, per shelf. */
  const [stops, setStops] = useState<Record<string, number>>({})
  /** The box with focus in the lists, and the one under the pointer. */
  const focused = useRef<number | undefined>(undefined)
  const pointed = useRef<number | undefined>(undefined)
  const live = useRef(false)
  const pendingFocus = useRef<{ shelf: number; index: number } | undefined>(undefined)
  // Reduced motion, read once: the camera cuts, and the switch is a crossfade.
  const [calm] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // The latest props, for what the scene calls back.
  const latest = useRef({ shelves, platforms, onLive, onFallback, onOpen, t })
  useLayoutEffect(() => {
    latest.current = { shelves, platforms, onLive, onFallback, onOpen, t }
  })

  const labelOf = (shelf: DrawnShelf): LabelText => {
    const playing =
      shelf.kind === 'status'
        ? 0
        : shelf.items.filter((item) => item.game.status === 'playing').length
    return {
      name: shelfName(shelf, latest.current.t),
      count: latest.current.t('shelf.count', { count: shelf.total }),
      playing: playing > 0 ? latest.current.t('shelf.playing', { count: playing }) : undefined,
    }
  }

  /** The item a scene box draws. */
  const itemAt = (box: number): { shelf: number; index: number; item: ShelfItem } | undefined => {
    const room = scene.current?.room3d
    const placed = room?.boxes[box]
    if (!placed) return undefined
    const item = latest.current.shelves[placed.shelf]?.items[placed.index]
    return item ? { shelf: placed.shelf, index: placed.index, item } : undefined
  }

  /** Draws the focus ring and the hover label where the scene put their box this frame. */
  const follow = (stats: SceneStats) => {
    const view = scene.current
    if (!view) return
    const ringBox = focused.current
    const ringRect = ringBox === undefined ? undefined : view.boxRect(ringBox)
    if (ring.current) {
      ring.current.hidden = !ringRect
      if (ringRect) {
        ring.current.style.transform = `translate(${ringRect.x - 5}px, ${ringRect.y - 5}px)`
        ring.current.style.width = `${ringRect.width + 10}px`
        ring.current.style.height = `${ringRect.height + 10}px`
      }
    }
    const tagBox = stats.pulled === undefined ? stats.hot : undefined
    const tagRect = tagBox === undefined ? undefined : view.boxRect(tagBox)
    if (tag.current) {
      tag.current.hidden = !tagRect
      if (tagRect) {
        tag.current.style.transform = `translate(${tagRect.x + tagRect.width / 2}px, ${tagRect.y - 12}px) translate(-50%, -100%)`
      }
    }
    if (!live.current && stats.frames > 0) {
      live.current = true
      latest.current.onLive()
    }
    // Which shelf the camera is at, for the index.
    const room = view.room3d
    const at = room.shelves.findIndex((shelf) => view.cameraX < shelf.x1 + 120)
    setCurrent((before) => (at >= 0 && at !== before ? at : before))
  }

  const showTag = (box: number | undefined) => {
    const found = box === undefined ? undefined : itemAt(box)
    if (!tag.current || !found) return
    const { game } = found.item
    const platform = platformFor(found.item, latest.current.platforms)
    tag.current.textContent = [
      game.title,
      platform?.short,
      latest.current.t(`status.${game.status}`),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const setHot = (box: number | undefined) => {
    scene.current?.setHot(box)
    showTag(box)
  }

  const focusBox = (shelf: number, index: number) => {
    const key = shelves[shelf]?.key
    if (key === undefined) return
    setStops((before) => (before[key] === index ? before : { ...before, [key]: index }))
    const button = lists.current?.querySelector<HTMLElement>(
      `[data-shelf="${shelf}"] [data-index="${index}"]`,
    )
    button?.focus({ preventScroll: true })
  }

  // The scene: made once, given the room once the page's type is ready.
  useEffect(() => {
    const element = canvas.current
    const host = stage.current
    if (!element || !host) return
    let disposed = false
    let made: ShelfScene
    const fonts = readFonts(host)
    try {
      made = new ShelfScene(element, {
        calm,
        fonts,
        onLost: () => latest.current.onFallback('lost'),
        onSlow: () => latest.current.onFallback('slow'),
        onFrame: follow,
      })
    } catch {
      latest.current.onFallback('unsupported')
      return
    }
    scene.current = made
    const size = () => made.resize(host.clientWidth, host.clientHeight)
    size()
    const observer = new ResizeObserver(size)
    observer.observe(host)
    void fontsReady(fonts).then(() => {
      if (!disposed) setReady(true)
    })
    return () => {
      disposed = true
      observer.disconnect()
      made.dispose()
      scene.current = undefined
    }
    // Made once; everything that changes later is handed to the scene by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The room: drawn again when the shelves, or how boxes stand, change.
  const started = useRef(false)
  useEffect(() => {
    const view = scene.current
    const host = stage.current
    if (!ready || !view || !host) return
    const light = readLighting(host)
    view.setRoom(
      toScene(shelves, platforms, light, labelOf),
      density === 'compact' ? 'compact' : 'covers',
      light,
    )
    if (!started.current) {
      started.current = true
      // The switch in: from the anchor, flat, then leaning back and gaining depth.
      const room = view.room3d
      let start: number | undefined
      if (anchor) {
        for (const [at, placed] of room.boxes.entries()) {
          const item = shelves[placed.shelf]?.items[placed.index]
          if (item && keyOf(item) === anchor.key) {
            start = at
            break
          }
        }
      }
      if (start !== undefined) view.jumpTo(room.boxes[start]!.x)
      if (!calm) {
        view.startFlat()
        view.flatten(0, SWITCH_MS)
      }
      if (start !== undefined && anchor?.focus) {
        const found = itemAt(start)
        if (found) {
          setStops((before) => ({ ...before, [shelves[found.shelf]!.key]: found.index }))
          // Focus moves once the page hands this shelf over; see below.
          pendingFocus.current = { shelf: found.shelf, index: found.index }
        }
      }
    }
    // labelOf reads the translator through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shelves, platforms, density])

  // The game that had focus in 2D gets it here, once this shelf can take it.
  useEffect(() => {
    const target = pendingFocus.current
    if (!interactive || !target) return
    pendingFocus.current = undefined
    focusBox(target.shelf, target.index)
  })

  // The light: follows a theme change as it plays, about a second (architecture, section 11).
  useEffect(() => {
    const host = stage.current
    if (!ready || !host) return
    let frame = 0
    let until = 0
    const read = () => {
      frame = 0
      const light = readLighting(host)
      const done = performance.now() >= until
      // The labels are drawn in the theme's ink: once, at the end.
      scene.current?.setLighting(light, done ? latest.current.shelves.map(labelOf) : undefined)
      if (!done) frame = requestAnimationFrame(read)
    }
    const observer = new MutationObserver(() => {
      const changing = document.documentElement.hasAttribute('data-theme-changing')
      until = performance.now() + (changing ? 1100 : 0)
      if (!frame) frame = requestAnimationFrame(read)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-changing'],
    })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ready])

  // Pulling the open game out, and putting it back.
  useEffect(() => {
    const view = scene.current
    if (!ready || !view) return
    const box = open
      ? boxIndexOf(
          view.room3d,
          shelves.findIndex((shelf) => shelf.key === open.key),
          open.index,
        )
      : undefined
    view.setPulled(box, panelWidth())
    if (box !== undefined) view.showBox(box)
  }, [ready, open, shelves])

  useLayoutEffect(() => {
    handleRef.current = {
      anchor: () => {
        const view = scene.current
        const box = focused.current ?? view?.middleBox()
        const found = box === undefined ? undefined : itemAt(box)
        return found ? { key: keyOf(found.item), focus: focused.current !== undefined } : undefined
      },
      leave: () =>
        new Promise((resolve) => {
          const view = scene.current
          if (!view || calm) return resolve()
          view.setPulled(undefined)
          view.flatten(1, SWITCH_MS)
          setTimeout(resolve, SWITCH_MS)
        }),
      stay: () => scene.current?.flatten(0, calm ? 0 : SWITCH_MS),
    }
  })

  /* --------------------------------------------------------- input */

  // The wheel walks the camera. It is the page's own scroll everywhere else.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom is the browser's.
      if (event.ctrlKey) return
      const view = scene.current
      if (!view) return
      event.preventDefault()
      view.nudgeBy(wheelDistance(event, view.pixelsToWall * 1.6))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const press = useRef<{ x: number; y: number; dragging: boolean; id: number } | undefined>(
    undefined,
  )

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    press.current = { x: event.clientX, y: event.clientY, dragging: false, id: event.pointerId }
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const view = scene.current
    if (!view) return
    const held = press.current
    if (held && held.id === event.pointerId) {
      const dx = event.clientX - held.x
      if (!held.dragging && Math.abs(dx) + Math.abs(event.clientY - held.y) > DRAG_SLOP) {
        held.dragging = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      if (held.dragging) {
        view.nudgeBy(-(event.clientX - held.x) * view.pixelsToWall)
        held.x = event.clientX
        held.y = event.clientY
        return
      }
    }
    if (event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    const box = view.pick(event.clientX - rect.left, event.clientY - rect.top)
    pointed.current = box
    setHot(box ?? focused.current)
    event.currentTarget.style.cursor = box === undefined ? 'grab' : 'pointer'
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const held = press.current
    press.current = undefined
    if (!held || held.dragging) return
    const view = scene.current
    if (!view) return
    const rect = event.currentTarget.getBoundingClientRect()
    const box = view.pick(event.clientX - rect.left, event.clientY - rect.top)
    const found = box === undefined ? undefined : itemAt(box)
    if (!found) return
    // A click in the scene moves focus in the lists, then opens the game.
    focusBox(found.shelf, found.index)
    latest.current.onOpen({ key: shelves[found.shelf]!.key, index: found.index })
  }

  const onPointerLeave = () => {
    pointed.current = undefined
    setHot(focused.current)
  }

  /* ------------------------------------------------------ the lists */

  const onFocusBox = (shelf: number, index: number) => {
    const view = scene.current
    if (!view) return
    const box = boxIndexOf(view.room3d, shelf, index)
    focused.current = box
    if (box === undefined) return
    setHot(box)
    view.showBox(box)
    const key = shelves[shelf]?.key
    if (key !== undefined)
      setStops((before) => (before[key] === index ? before : { ...before, [key]: index }))
  }

  const onBlurLists = (event: FocusEvent<HTMLDivElement>) => {
    if (lists.current?.contains(event.relatedTarget as Node | null)) return
    focused.current = undefined
    setHot(pointed.current)
    scene.current?.invalidate()
  }

  /** A box on the ledge above or below, nearest along the wall. */
  const vertical = (shelf: number, index: number, direction: -1 | 1): number | undefined => {
    const view = scene.current
    const room = view?.room3d
    const box = room ? boxIndexOf(room, shelf, index) : undefined
    if (!room || box === undefined) return undefined
    const here = room.boxes[box]!
    const ledge = room.ledges[here.ledge]!
    // Ledges of a bay are stored top first: the one below is the next.
    const target = room.ledges.find(
      (other) =>
        other.shelf === ledge.shelf &&
        other.bay === ledge.bay &&
        (direction === 1 ? other.y < ledge.y : other.y > ledge.y) &&
        Math.abs(other.y - ledge.y) < (room.pitches[ledge.shelf] ?? 0) * 1.5,
    )
    if (!target || target.from === target.to) return undefined
    let best = target.from
    for (let at = target.from; at < target.to; at += 1) {
      if (Math.abs(room.boxes[at]!.x - here.x) < Math.abs(room.boxes[best]!.x - here.x)) best = at
    }
    return room.boxes[best]!.index
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, shelf: number, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const count = shelves[shelf]?.items.length ?? 0
    const go = (to: number | undefined) => {
      if (to === undefined) return
      focusBox(shelf, Math.min(count - 1, Math.max(0, to)))
    }
    const toShelf = (direction: -1 | 1) => {
      const next = shelf + direction
      if (next < 0 || next >= shelves.length) return
      scene.current?.showShelf(next)
      focusBox(next, stops[shelves[next]!.key] ?? 0)
    }
    const keys: Record<string, () => void> = {
      ArrowRight: () => go(index + 1),
      ArrowLeft: () => go(index - 1),
      ArrowDown: () => go(vertical(shelf, index, 1)),
      ArrowUp: () => go(vertical(shelf, index, -1)),
      Home: () => go(0),
      End: () => go(count - 1),
      PageDown: () => toShelf(1),
      PageUp: () => toShelf(-1),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  return (
    <div ref={stage} className="shelf-3d" data-shelf-3d="" data-ready={ready ? 'true' : undefined}>
      <canvas
        ref={canvas}
        className="shelf-3d-canvas"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (press.current = undefined)}
        onPointerLeave={onPointerLeave}
      />

      <div ref={ring} className="shelf-3d-ring" aria-hidden="true" hidden />
      <div ref={tag} className="shelf-3d-tag" aria-hidden="true" hidden />

      {shelves.length > 1 ? (
        <nav className="shelf-3d-index" aria-label={t('shelf3d.index')}>
          {shelves.map((shelf, at) => (
            <button
              key={shelf.key}
              type="button"
              className="shelf-3d-tick"
              aria-current={at === current ? 'true' : undefined}
              aria-label={t('shelf3d.tick', { shelf: shelfName(shelf, t), count: shelf.total })}
              onClick={() => {
                scene.current?.showShelf(at)
                focusBox(at, stops[shelf.key] ?? 0)
              }}
            >
              <span className="shelf-3d-tick-name" aria-hidden="true">
                {shelfName(shelf, t, true)}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      <div ref={lists} className="shelf-3d-lists" onBlur={onBlurLists}>
        {shelves.map((shelf, s) => {
          const name = shelfName(shelf, t)
          const headingId = `shelf-3d-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`
          const stop = Math.min(stops[shelf.key] ?? 0, Math.max(0, shelf.items.length - 1))
          return (
            <section key={shelf.key} data-shelf={s} aria-labelledby={headingId}>
              {/* Named and counted as the 2D shelf's heading is. */}
              <h2 id={headingId}>{name}</h2>
              <p>{t('shelf.count', { count: shelf.total })}</p>
              <ul aria-label={t('shelf.games', { shelf: name })}>
                {shelf.items.map((item, index) => (
                  <li key={keyOf(item)}>
                    <button
                      type="button"
                      data-index={index}
                      // Not data-flip: the 2D shelf animates those, and these are never seen.
                      data-box={keyOf(item)}
                      data-status={item.game.status}
                      tabIndex={index === stop ? 0 : -1}
                      aria-label={describeBox(item, platformFor(item, platforms), t)}
                      onFocus={() => onFocusBox(s, index)}
                      onKeyDown={(event) => onKeyDown(event, s, index)}
                      onClick={() => onOpen({ key: shelf.key, index })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
