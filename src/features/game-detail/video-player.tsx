'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog } from 'radix-ui'

import type { GameVideo } from '@/domain/igdb/game'

/**
 * A game's video, played over the page (spec 7.1). Its code and YouTube's
 * player load only now, when it is pressed: the strip shows the game's own
 * pictures, so nothing reaches YouTube before. YouTube's privacy-enhanced
 * address keeps it from setting cookies until the video plays.
 */
export default function VideoPlayer({
  video,
  title,
  onClose,
}: {
  video: GameVideo | undefined
  title: string
  onClose: () => void
}) {
  const t = useTranslations('Game')
  const name = video?.name ?? t('video')
  return (
    <Dialog.Root open={video !== undefined} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-black/92 fixed inset-0 z-[60] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="text-white fixed inset-0 z-[60] flex flex-col outline-none data-[state=open]:animate-fade-in"
          onKeyDown={(event) => {
            // The game's panel around it steps through games on these keys.
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation()
          }}
        >
          <div className="flex flex-none items-center justify-between gap-3 px-4 py-3">
            <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
              {t('videoTitle', { name, title })}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t('viewerClose')}
              className="bg-white/10 hover:bg-white/20 inline-flex size-11 flex-none items-center justify-center rounded-full"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('videoFrom')}</Dialog.Description>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
            {video ? (
              <iframe
                key={video.id}
                title={t('videoTitle', { name, title })}
                src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="bg-black aspect-video max-h-full w-full max-w-6xl rounded-case"
              />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
