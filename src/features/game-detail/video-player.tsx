'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import type { GameVideo } from '@/domain/igdb/game'
import { Ghost } from '@/ui/ghost'

import { galleryPlaying } from './media-focus'
import { loadYoutube, type YoutubePlayer } from './youtube'

/** One inline player, created only after a press or a saved autoplay choice. YouTube keeps its controls. */
export default function VideoPlayer({
  video,
  title,
  playing,
  visible,
  focusOnReady = false,
  onPaused,
  onPlaying,
  onFailed,
}: {
  video: GameVideo
  title: string
  playing: boolean
  visible: boolean
  focusOnReady?: boolean
  onPaused: () => void
  onPlaying: () => void
  onFailed: () => void
}) {
  const t = useTranslations('Game')
  const frame = useRef<HTMLDivElement>(null)
  const player = useRef<YoutubePlayer | undefined>(undefined)
  const owner = useRef(Symbol())
  const [ready, setReady] = useState(false)
  const latest = useRef({ playing, visible, focusOnReady, onPaused, onPlaying, onFailed })
  useEffect(() => {
    latest.current = { playing, visible, focusOnReady, onPaused, onPlaying, onFailed }
  }, [playing, visible, focusOnReady, onPaused, onPlaying, onFailed])
  const commandedPause = useRef(false)
  const restored = useRef(false)

  useEffect(() => {
    let current = true
    const container = frame.current!
    const slot = document.createElement('div')
    container.append(slot)
    const token = owner.current
    const failed = () => {
      if (current) latest.current.onFailed()
    }
    const timer = window.setTimeout(failed, 25_000)
    void loadYoutube()
      .then((api) => {
        if (!current) return
        player.current = new api.Player(slot, {
          host: 'https://www.youtube-nocookie.com',
          videoId: video.id,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: ({ target }) => {
              if (!current) return
              window.clearTimeout(timer)
              target.getIframe().title = t('videoTitle', { name: video.name ?? t('video'), title })
              target.mute()
              setReady(true)
              if (restored.current) latest.current.onPaused()
              else if (latest.current.playing) {
                target.playVideo()
                if (latest.current.focusOnReady) target.getIframe().focus({ preventScroll: true })
              }
            },
            onStateChange: ({ data }) => {
              if (!current) return
              if (data === 1 && !latest.current.visible) {
                commandedPause.current = true
                player.current?.pauseVideo()
                galleryPlaying(token, false)
                return
              }
              galleryPlaying(token, data === 1)
              if (data === 1) {
                commandedPause.current = false
                latest.current.onPlaying()
              }
              // A pause from the player's own controls must survive scrolling and redraws.
              if (data === 0 || (data === 2 && !commandedPause.current)) latest.current.onPaused()
              if (data === 2) commandedPause.current = false
            },
            onError: failed,
            onAutoplayBlocked: failed,
          },
        })
      })
      .catch(failed)
    return () => {
      current = false
      window.clearTimeout(timer)
      restored.current = true
      galleryPlaying(token, false)
      player.current?.destroy()
      player.current = undefined
      container.replaceChildren()
    }
  }, [video.id, video.name, title, t])

  useEffect(() => {
    if (!ready || !player.current) return
    if (playing) player.current.playVideo()
    else {
      commandedPause.current = true
      player.current.pauseVideo()
      galleryPlaying(owner.current, false)
    }
  }, [playing, ready])

  return (
    <div className="gallery-player">
      {!ready ? <Ghost className="absolute inset-0 rounded-case" /> : null}
      <div ref={frame} className="absolute inset-0" />
    </div>
  )
}
