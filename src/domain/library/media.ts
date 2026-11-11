import type { GameImage, GameVideo } from '@/domain/igdb/game'

export type GalleryItem =
  | { kind: 'video'; video: GameVideo; number: number }
  | { kind: 'shot'; shot: GameImage; number: number }

/** Gameplay, when named as such, then at most two videos before the screenshots (Steamworks). */
export function galleryItems(
  shots: readonly GameImage[],
  videos: readonly GameVideo[],
): GalleryItem[] {
  const trailers: GalleryItem[] = videos
    .map((video, index) => ({ kind: 'video' as const, video, number: index + 1 }))
    .sort(
      (a, b) =>
        Number(/gameplay/i.test(b.video.name ?? '')) - Number(/gameplay/i.test(a.video.name ?? '')),
    )
  const pictures: GalleryItem[] = shots.map((shot, index) => ({
    kind: 'shot',
    shot,
    number: index + 1,
  }))
  return [...trailers.slice(0, 2), ...pictures, ...trailers.slice(2)]
}

/** Public posters are proxied by Next's image optimizer; a browser never contacts YouTube for one. */
export const videoPoster = (id: string): string =>
  `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`

/** Next's pinned default image loader, without adding its interactive Image component to every page. */
export function videoPosterSources(id: string) {
  const address = (width: number) =>
    `/_next/image?url=${encodeURIComponent(videoPoster(id))}&w=${width}&q=75`
  return {
    src: address(640),
    srcSet: [128, 256, 640, 1080].map((width) => `${address(width)} ${width}w`).join(', '),
  }
}
