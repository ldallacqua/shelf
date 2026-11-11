'use client'

import { EyeIcon, PauseIcon, PlayIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { steamFileUrl } from '@/domain/igdb/images'
import type { DescriptionPicture } from '@/domain/steam/description'

/** Whether a description's pictures for adults were asked for, and how to ask. */
const AdultShown = createContext<{ shown: boolean; show: () => void }>({
  shown: false,
  show: () => {},
})

/**
 * Around a description with pictures for adults: one press shows them all, as one does a game's
 * screenshots. Asked once a game: stepping to the next game asks again.
 */
export function AdultPictures({ game, children }: { game: string; children: ReactNode }) {
  const [shownFor, setShownFor] = useState<string>()
  return (
    <AdultShown value={{ shown: shownFor === game, show: () => setShownFor(game) }}>
      {children}
    </AdultShown>
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const subscribeToMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * Whether this device asks for reduced motion; the server, which cannot tell, says yes, so nothing
 * moves before the device has said. Not `useReducedMotion`, whose module would bring every
 * preference to a game's page.
 */
const useCalm = () =>
  useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  )

/** How far ahead of the window a clip starts loading, so it is moving as it arrives. */
const NEAR = '200px'

/**
 * A picture in a description that does something: a clip that loops in its place as a GIF would,
 * or a picture for adults, drawn blurred until asked for. A clip plays while it is near the
 * window, never under reduced motion until pressed, and pressing it pauses it (WCAG 2.2.2). Its
 * still is drawn first and stays under it, and the clip loads only once it is to play.
 */
export function DescriptionMedia({
  picture,
  title,
}: {
  picture: DescriptionPicture
  title: string
}) {
  const t = useTranslations('Game')
  const { shown, show } = use(AdultShown)
  const calm = useCalm()
  const frame = useRef<HTMLButtonElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  /** Play or pause, as pressed: until then, as motion is allowed. */
  const [chosen, setChosen] = useState<boolean>()
  const [started, setStarted] = useState(false)

  const hidden = picture.mature === true && !shown
  const loop = picture.loop
  const play = loop !== undefined && !hidden && near && (chosen ?? !calm)

  useEffect(() => {
    const element = frame.current
    if (!element || !loop) return
    const watcher = new IntersectionObserver(([each]) => setNear(each?.isIntersecting ?? false), {
      rootMargin: NEAR,
    })
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [loop])

  useEffect(() => {
    const element = video.current
    if (!element) return
    // A browser may refuse to play: the still stays, and the button still says Play.
    if (play) element.play().catch(() => undefined)
    else element.pause()
  }, [play, started])

  const still = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      src={steamFileUrl(picture.id)}
      width={picture.width}
      height={picture.height}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
  const clip =
    loop && (play || started) ? (
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        width={picture.width}
        height={picture.height}
        aria-hidden="true"
        onPlaying={() => setStarted(true)}
      >
        {loop.mp4 ? <source src={steamFileUrl(loop.mp4)} type="video/mp4" /> : null}
        {loop.webm ? <source src={steamFileUrl(loop.webm)} type="video/webm" /> : null}
      </video>
    ) : null
  const adultMark = picture.mature ? (
    <span className="picture-mark" data-place={hidden ? 'middle' : 'corner'} aria-hidden="true">
      {hidden ? <EyeIcon className="size-4" /> : null}
      {t('adultMark')}
    </span>
  ) : null

  if (!loop && !hidden) {
    return (
      <div className="game-picture" data-adult={picture.mature ? 'shown' : undefined}>
        {still}
        {adultMark}
      </div>
    )
  }
  return (
    <button
      ref={frame}
      type="button"
      className="game-picture"
      data-adult={picture.mature ? (hidden ? 'hidden' : 'shown') : undefined}
      aria-label={t(hidden ? 'pictureAdult' : play ? 'loopPause' : 'loopPlay', { title })}
      onClick={() => (hidden ? show() : setChosen(!play))}
    >
      {still}
      {clip}
      {adultMark}
      {loop && !hidden ? (
        <span className="picture-mark" data-place="start" aria-hidden="true">
          {play ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
        </span>
      ) : null}
    </button>
  )
}
