'use client'

import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog } from 'radix-ui'
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from 'react'

import type { GameImage, GameVideo } from '@/domain/igdb/game'
import { imageUrl, screenshotSources } from '@/domain/igdb/images'

/** How far a screenshot can be zoomed. */
const MAX_ZOOM = 4
/** What a double tap or a double click zooms to. */
const TAP_ZOOM = 2.5

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type View = { scale: number; x: number; y: number }
const AT_REST: View = { scale: 1, x: 0, y: 0 }

/**
 * A screenshot's zoom, worked by two fingers, a double tap, a trackpad's
 * pinch or Ctrl and the wheel. Written straight to the image, frame by
 * frame: asking React to draw each step would lag the fingers.
 */
function useZoom(onZoomed: (zoomed: boolean) => void) {
  const view = useRef<View>(AT_REST)
  const image = useRef<HTMLImageElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; from: View }
    | { kind: 'pan'; at: { x: number; y: number }; from: View }
    | undefined
  >(undefined)

  /** The picture's frame, which the zoom does not move: the slide it fills. */
  const frame = () => image.current?.parentElement?.getBoundingClientRect()

  const apply = (next: View) => {
    const element = image.current
    const box = frame()
    if (!element || !box) return
    // The picture may not be dragged off the screen.
    const limitX = (box.width * (next.scale - 1)) / 2
    const limitY = (box.height * (next.scale - 1)) / 2
    const clamped = {
      scale: next.scale,
      x: Math.max(-limitX, Math.min(limitX, next.x)),
      y: Math.max(-limitY, Math.min(limitY, next.y)),
    }
    const zoomedBefore = view.current.scale > 1
    view.current = clamped
    element.style.transform = `translate(${clamped.x}px, ${clamped.y}px) scale(${clamped.scale})`
    if (zoomedBefore !== clamped.scale > 1) onZoomed(clamped.scale > 1)
  }

  /**
   * Zooms from `from` to `scale`, so that the point of the picture that was
   * under `start` on the screen ends up under `end`. A point p of the picture,
   * measured from its middle C, is drawn at C + (x, y) + scale * p.
   */
  const zoomTo = (
    from: View,
    scale: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const box = frame()
    if (!box) return
    const target = Math.max(1, Math.min(MAX_ZOOM, scale))
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    const p = {
      x: (start.x - center.x - from.x) / from.scale,
      y: (start.y - center.y - from.y) / from.scale,
    }
    apply({ scale: target, x: end.x - center.x - target * p.x, y: end.y - center.y - target * p.y })
  }

  /** Zooms to `scale`, keeping the point under (x, y) where it is. */
  const zoomAt = (scale: number, x: number, y: number) =>
    zoomTo(view.current, scale, { x, y }, { x, y })

  const reset = () => {
    pointers.current.clear()
    gesture.current = undefined
    apply(AT_REST)
  }

  const points = () => [...pointers.current.values()]

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const [a, b] = points()
      if (a && b) {
        gesture.current = {
          kind: 'pinch',
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          from: view.current,
        }
      } else if (a && view.current.scale > 1) {
        gesture.current = { kind: 'pan', at: a, from: view.current }
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!pointers.current.has(event.pointerId)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const now = gesture.current
      const [a, b] = points()
      if (now?.kind === 'pinch' && a && b) {
        // Two fingers both zoom and move: what was under them stays under them.
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        zoomTo(now.from, (now.from.scale * distance) / Math.max(1, now.distance), now.mid, mid)
      } else if (now?.kind === 'pan' && a) {
        apply({ ...now.from, x: now.from.x + a.x - now.at.x, y: now.from.y + a.y - now.at.y })
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      pointers.current.delete(event.pointerId)
      gesture.current = undefined
      // Let go almost at rest: back to rest.
      if (view.current.scale < 1.05) apply(AT_REST)
    },
    onDoubleClick: (event: { clientX: number; clientY: number }) => {
      if (view.current.scale > 1) apply(AT_REST)
      else zoomAt(TAP_ZOOM, event.clientX, event.clientY)
    },
  }

  const wheel = (event: WheelEvent) => {
    // A trackpad's pinch arrives as the wheel with Ctrl held.
    if (!event.ctrlKey) return
    event.preventDefault()
    zoomAt(view.current.scale * Math.exp(-event.deltaY / 100), event.clientX, event.clientY)
  }

  return { image, reset, handlers, wheel }
}

type ViewerProps = {
  shots: readonly GameImage[]
  title: string
  /** Which screenshot is open, or nothing. */
  open?: number
  onClose: () => void
}

/**
 * The screenshots, full screen: one at a time, swiped sideways or stepped
 * with the arrow keys, and zoomed with two fingers. Swiping is the browser's
 * own scrolling, snapped to each picture, so it feels as a phone's photos do.
 */
function ScreenshotViewer({ shots, title, open, onClose }: ViewerProps) {
  const t = useTranslations('Game')
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(open ?? 0)
  const [openedAt, setOpenedAt] = useState(open)
  if (open !== openedAt) {
    setOpenedAt(open)
    if (open !== undefined) setAt(open)
  }
  const [zoomed, setZoomed] = useState(false)
  const zoom = useZoom(setZoomed)

  // The wheel listener must be able to stop the page zooming, so it is not passive.
  useEffect(() => {
    const element = track.current
    if (!element || open === undefined) return
    const onWheel = (event: WheelEvent) => zoom.wheel(event)
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  })

  const go = (index: number) => {
    const element = track.current
    if (!element || index < 0 || index >= shots.length) return
    zoom.reset()
    element.scrollTo({
      left: index * element.clientWidth,
      behavior: reduced() ? 'instant' : 'smooth',
    })
  }

  return (
    <Dialog.Root open={open !== undefined} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-cinema/92 data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="shot-viewer fixed inset-0 z-[60] flex flex-col text-on-cinema outline-none data-[state=open]:animate-fade-in"
          onOpenAutoFocus={() => {
            // Opens at the screenshot chosen, with no slide to it. The viewer is in the page by now.
            const element = track.current
            if (element && open !== undefined) element.scrollLeft = open * element.clientWidth
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') go(at - 1)
            else if (event.key === 'ArrowRight') go(at + 1)
            else return
            event.preventDefault()
            // The game's panel around it steps through games on the same keys.
            event.stopPropagation()
          }}
        >
          <Dialog.Title className="sr-only">{t('viewerTitle', { title })}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('viewerHelp')}</Dialog.Description>
          <div className="flex flex-none items-center justify-between gap-3 px-4 py-3">
            <p className="readout text-[0.6875rem]" aria-live="polite">
              {t('viewerCount', { at: at + 1, total: shots.length })}
            </p>
            <Dialog.Close
              aria-label={t('viewerClose')}
              className="inline-flex size-11 items-center justify-center rounded-full bg-on-cinema/10 hover:bg-on-cinema/20"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <div
            ref={track}
            className="shot-track"
            data-zoomed={zoomed ? '' : undefined}
            onScroll={(event) => {
              const element = event.currentTarget
              const index = Math.round(element.scrollLeft / Math.max(1, element.clientWidth))
              if (index !== at) {
                zoom.reset()
                setAt(index)
              }
            }}
          >
            {shots.map((shot, index) => (
              <div key={shot.id} className="shot-slide" {...(index === at ? zoom.handlers : {})}>
                {/* Straight from IGDB's servers, which resize them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={index === at ? zoom.image : undefined}
                  alt={t('screenshotAlt', { at: index + 1, total: shots.length, title })}
                  src={imageUrl(shot.id, '1080p')}
                  srcSet={[
                    `${imageUrl(shot.id, 'screenshot_big')} 889w`,
                    `${imageUrl(shot.id, 'screenshot_huge')} 1280w`,
                    `${imageUrl(shot.id, '1080p')} 1920w`,
                  ].join(', ')}
                  sizes="100vw"
                  loading={Math.abs(index - at) <= 1 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-none items-center justify-center gap-3 px-4 py-3 pointer-coarse:hidden">
            <button
              type="button"
              aria-label={t('viewerPrevious')}
              disabled={at === 0}
              onClick={() => go(at - 1)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-on-cinema/10 hover:bg-on-cinema/20 disabled:opacity-40"
            >
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('viewerNext')}
              disabled={at === shots.length - 1}
              onClick={() => go(at + 1)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-on-cinema/10 hover:bg-on-cinema/20 disabled:opacity-40"
            >
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const VideoPlayer = lazy(() => import('./video-player'))

/**
 * A game's videos and screenshots, in one strip that scrolls sideways
 * (spec 7.1): videos first, each on one of the game's own pictures with a
 * play button, then the screenshots. No scrollbar: an edge with more past it
 * fades, and an arrow there moves the strip on a pointer that can hover.
 */
export function Screenshots({
  shots,
  videos = [],
  title,
}: {
  shots: readonly GameImage[]
  videos?: readonly GameVideo[]
  title: string
}) {
  const t = useTranslations('Game')
  const [open, setOpen] = useState<number>()
  const [playing, setPlaying] = useState<GameVideo>()
  const strip = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ before: false, after: false })

  // Which ends have more past them: on scrolling, and whenever the strip's width changes.
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const measure = () => {
      const before = element.scrollLeft > 4
      const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 4
      setEdges((now) => (now.before === before && now.after === after ? now : { before, after }))
    }
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const resized = new ResizeObserver(measure)
    resized.observe(element)
    return () => {
      element.removeEventListener('scroll', measure)
      resized.disconnect()
    }
  }, [])

  const step = (direction: 1 | -1) => {
    const element = strip.current
    if (!element) return
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: reduced() ? 'instant' : 'smooth',
    })
  }

  const total = videos.length + shots.length
  return (
    <>
      <div
        className="media-strip"
        data-before={edges.before ? '' : undefined}
        data-after={edges.after ? '' : undefined}
      >
        <button
          type="button"
          className="media-step"
          data-side="before"
          aria-label={t('stripBefore')}
          tabIndex={edges.before ? 0 : -1}
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </button>
        <ul ref={strip} className="shot-strip">
          {videos.map((video, index) => {
            const picture = shots[index % Math.max(1, shots.length)]
            const name = video.name ?? t('video')
            return (
              <li key={video.id}>
                <button
                  type="button"
                  className="shot-thumb media-video"
                  aria-label={t('videoOpen', { name, at: index + 1, total, title })}
                  onClick={() => setPlaying(video)}
                >
                  {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      {...screenshotSources(picture.id)}
                      sizes="(min-width: 40rem) 224px, 176px"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : null}
                  <span className="media-play" aria-hidden="true">
                    <span>
                      <PlayIcon className="size-5 translate-x-px" fill="currentColor" />
                    </span>
                  </span>
                  <span className="media-name" aria-hidden="true">
                    {name}
                  </span>
                </button>
              </li>
            )
          })}
          {shots.map((shot, index) => (
            <li key={shot.id}>
              <button
                type="button"
                className="shot-thumb"
                aria-label={t('screenshotOpen', {
                  at: videos.length + index + 1,
                  total,
                  title,
                })}
                onClick={() => setOpen(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  {...screenshotSources(shot.id)}
                  sizes="(min-width: 40rem) 224px, 176px"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="media-step"
          data-side="after"
          aria-label={t('stripAfter')}
          tabIndex={edges.after ? 0 : -1}
          onClick={() => step(1)}
        >
          <ChevronRightIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      <ScreenshotViewer
        shots={shots}
        title={title}
        open={open}
        onClose={() => setOpen(undefined)}
      />
      {playing ? (
        <Suspense fallback={null}>
          <VideoPlayer video={playing} title={title} onClose={() => setPlaying(undefined)} />
        </Suspense>
      ) : null}
    </>
  )
}
