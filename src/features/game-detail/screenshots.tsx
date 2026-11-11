'use client'

import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, MaximizeIcon, PlayIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { lazy, Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import type { GameImage, GameVideo } from '@/domain/igdb/game'
import { screenshotSources } from '@/domain/igdb/images'
import { galleryItems, videoPosterSources, type GalleryItem } from '@/domain/library/media'
import {
  autoplayPreference,
  readPreference,
  subscribeToPreferences,
  writePreference,
} from '@/features/library/preferences'
import { Switch } from '@/ui/checkbox'

import { useAllowsAutoplay } from './media-preferences'

const VideoPlayer = lazy(() => import('./video-player'))
const ScreenshotViewer = lazy(() =>
  import('./screenshot-viewer').then((module) => ({ default: module.ScreenshotViewer })),
)
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const visiblePage = () => document.visibilityState === 'visible'
const subscribePage = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

/** The failed player gives its place back to a usable poster, without keeping a loading ghost. */
export function MediaFailure() {
  const t = useTranslations('Game')
  return (
    <p role="status" className="gallery-error">
      {t('galleryFailed')}
    </p>
  )
}

/** Shared with the navigation drawing: the selected frame and rail reserve their real geometry. */
export function MediaSkeleton() {
  return (
    <div aria-hidden="true" className="game-gallery">
      <div className="gallery-stage ghost" />
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="gallery-thumb ghost" />
        ))}
      </div>
      <span className="ghost h-6 w-44 rounded-control" />
    </div>
  )
}

function Picture({
  item,
  large,
  fallback,
}: {
  item: GalleryItem
  large?: boolean
  fallback?: GameImage
}) {
  const [failed, setFailed] = useState(false)
  const sizes = large ? '(min-width: 80rem) 900px, (min-width: 40rem) 80vw, 100vw' : '128px'
  if (item.kind === 'video' && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- The first-party optimizer resizes these public posters.
      <img
        alt=""
        {...videoPosterSources(item.video.id)}
        width={480}
        height={360}
        className="gallery-video-image"
        sizes={sizes}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  const shot = item.kind === 'shot' ? item.shot : fallback
  if (!shot) return null
  // These files are already resized by their source. Only YouTube's public posters need a first-party proxy.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      {...screenshotSources(shot.id)}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

function VideoStage({
  item,
  title,
  automatic,
  manual,
  visible,
  hidden,
  reveal,
  fallback,
}: {
  item: Extract<GalleryItem, { kind: 'video' }>
  title: string
  automatic: boolean
  manual: boolean
  visible: boolean
  hidden: boolean
  reveal: () => void
  fallback?: GameImage
}) {
  const t = useTranslations('Game')
  const [intent, setIntent] = useState<'idle' | 'manual' | 'auto' | 'paused'>(
    manual ? 'manual' : 'idle',
  )
  const [failed, setFailed] = useState(false)
  if (intent === 'idle' && automatic && visible && !hidden) setIntent('auto')
  const name = t('galleryVideoName', { number: item.number, name: item.video.name ?? t('video') })
  const playing = visible && !hidden && (intent === 'manual' || (intent === 'auto' && automatic))
  return (
    <>
      {intent !== 'idle' && !hidden && !failed ? (
        <Suspense fallback={<div className="ghost absolute inset-0" />}>
          <VideoPlayer
            video={item.video}
            title={title}
            playing={playing}
            visible={visible}
            focusOnReady={intent === 'manual'}
            onPaused={() => setIntent('paused')}
            onPlaying={() => setIntent((now) => (now === 'paused' ? 'manual' : now))}
            onFailed={() => {
              setFailed(true)
              setIntent('paused')
            }}
          />
        </Suspense>
      ) : (
        <button
          type="button"
          className="gallery-poster"
          data-adult={hidden ? 'hidden' : undefined}
          aria-label={hidden ? t('galleryAdult', { title }) : t('galleryPlay', { name, title })}
          onClick={() => {
            if (hidden) reveal()
            else {
              setFailed(false)
              setIntent('manual')
            }
          }}
        >
          <Picture item={item} large fallback={fallback} />
          <span className="gallery-play" aria-hidden="true">
            {hidden ? <EyeIcon /> : <PlayIcon />}
          </span>
          <span className="gallery-caption">{hidden ? t('adultMark') : name}</span>
        </button>
      )}
      {failed ? <MediaFailure /> : null}
    </>
  )
}

/** A new game resets selection, explicit reveals and a manual pause, while the device choice stays. */
export function Screenshots(props: {
  game?: string
  shots: readonly GameImage[]
  videos?: readonly GameVideo[]
  title: string
  adult?: boolean
}) {
  return <Gallery key={props.game ?? props.title} {...props} />
}

function Gallery({
  shots,
  videos = [],
  title,
  adult = false,
}: {
  shots: readonly GameImage[]
  videos?: readonly GameVideo[]
  title: string
  adult?: boolean
}) {
  const t = useTranslations('Game')
  const items = galleryItems(shots, videos)
  const [at, setAt] = useState(0)
  const [request, setRequest] = useState(0)
  const [open, setOpen] = useState<number>()
  const [viewerAsked, setViewerAsked] = useState(false)
  const autoplayHint = useId()
  const [adultShown, setAdultShown] = useState(false)
  const [inView, setInView] = useState(false)
  const [edges, setEdges] = useState({ before: false, after: false })
  const stage = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLUListElement>(null)
  const activePage = useSyncExternalStore(subscribePage, visiblePage, () => false)
  const allows = useAllowsAutoplay()
  const choice = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(autoplayPreference),
    () => 'off' as const,
  )
  const selected = items[Math.min(at, items.length - 1)]
  useEffect(() => {
    const element = stage.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setInView((entry?.intersectionRatio ?? 0) >= 0.6),
      { threshold: [0, 0.6] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = strip.current
    if (!element) return
    // Kept when unchanged, so scrolling the strip draws the gallery again only at its ends.
    const measure = () => {
      const before = element.scrollLeft > 4
      const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 4
      setEdges((now) => (now.before === before && now.after === after ? now : { before, after }))
    }
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [])
  if (!selected) return null
  const seen = adultShown ? shots : shots.filter((shot) => !shot.mature)
  const hidden = !adultShown && (selected.kind === 'shot' ? selected.shot.mature === true : adult)
  const select = (index: number) => {
    setAt(index)
    setRequest((now) => now + 1)
  }
  const label = (item: GalleryItem) =>
    item.kind === 'video'
      ? t('galleryVideoName', { number: item.number, name: item.video.name ?? t('video') })
      : t('galleryShotName', { number: item.number })
  const step = (direction: -1 | 1) =>
    strip.current?.scrollBy({
      left: direction * strip.current.clientWidth * 0.8,
      behavior: reduced() ? 'instant' : 'smooth',
    })
  return (
    <div className="game-gallery">
      <div ref={stage} className="gallery-stage" data-adult={hidden ? 'hidden' : undefined}>
        {selected.kind === 'video' ? (
          <VideoStage
            key={`${selected.video.id}:${request}`}
            item={selected}
            title={title}
            automatic={choice === 'on' && allows}
            manual={request > 0}
            visible={inView && activePage}
            hidden={hidden}
            reveal={() => setAdultShown(true)}
            fallback={shots.find((shot) => !shot.mature)}
          />
        ) : (
          <button
            type="button"
            className="gallery-poster"
            aria-label={
              hidden
                ? t('screenshotAdult', { at: selected.number, total: shots.length, title })
                : t('screenshotOpen', { at: selected.number, total: shots.length, title })
            }
            onClick={() => {
              if (hidden) setAdultShown(true)
              else {
                setViewerAsked(true)
                setOpen(seen.indexOf(selected.shot))
              }
            }}
          >
            {/* A screenshot has no name to show, as on Steam: its number is for screen readers. */}
            <Picture item={selected} large />
            <span className="gallery-expand" aria-hidden="true">
              {hidden ? <EyeIcon /> : <MaximizeIcon />}
              {hidden ? t('adultMark') : t('galleryFullscreen')}
            </span>
          </button>
        )}
      </div>
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
        {/* The rail delegates arrow keys from its buttons; it is not a focus target itself. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <ul
          ref={strip}
          className="shot-strip"
          aria-label={t('media')}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            event.stopPropagation()
            const next = Math.max(
              0,
              Math.min(items.length - 1, at + (event.key === 'ArrowRight' ? 1 : -1)),
            )
            if (next === at) return
            select(next)
            strip.current?.querySelectorAll('button')[next]?.focus()
          }}
        >
          {items.map((item, index) => {
            const mature = item.kind === 'shot' ? item.shot.mature : adult
            const blurred = mature && !adultShown
            return (
              <li key={item.kind === 'video' ? `video-${item.video.id}` : `shot-${item.shot.id}`}>
                <button
                  type="button"
                  className="gallery-thumb"
                  aria-pressed={at === index}
                  aria-label={
                    blurred
                      ? t('galleryAdult', { title }) + ': ' + label(item)
                      : t('gallerySelect', { name: label(item), title })
                  }
                  data-adult={mature ? (blurred ? 'hidden' : 'shown') : undefined}
                  onClick={() => {
                    if (blurred) setAdultShown(true)
                    select(index)
                  }}
                >
                  {/* No words on a tile, as on Steam: a video is told by its play mark, and its
                      name is said on the stage and in the button's name. */}
                  <Picture item={item} fallback={shots.find((shot) => !shot.mature)} />
                  {item.kind === 'video' ? (
                    <PlayIcon className="gallery-thumb-play" aria-hidden="true" />
                  ) : null}
                  {mature ? (
                    <span className="shot-adult" aria-hidden="true">
                      {blurred ? <EyeIcon className="size-4" /> : null}
                      {t('adultMark')}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
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
      {videos.length ? (
        <div className="gallery-settings">
          <label className="flex min-h-6 items-center gap-2 text-sm">
            <Switch
              aria-describedby={autoplayHint}
              checked={choice === 'on'}
              onChange={(event) =>
                writePreference(autoplayPreference, event.currentTarget.checked ? 'on' : 'off')
              }
            />
            <span>{t('galleryAutoplay')}</span>
          </label>
          <p id={autoplayHint} className="text-xs text-muted">
            {t(allows ? 'galleryAutoplayHint' : 'galleryCalmHint')}
          </p>
        </div>
      ) : null}
      {viewerAsked ? (
        <Suspense
          fallback={
            <div
              aria-hidden="true"
              className="fixed inset-0 z-[60] flex items-center justify-center bg-cinema/92 p-4"
            >
              <span className="ghost aspect-video w-full max-w-6xl rounded-case" />
            </div>
          }
        >
          <ScreenshotViewer
            shots={seen}
            title={title}
            open={open}
            onClose={() => setOpen(undefined)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
