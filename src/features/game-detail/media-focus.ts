let playing: symbol | undefined
const listeners = new Set<() => void>()

/** Description loops yield while the gallery is playing, including during a navigation handoff. */
export function galleryPlaying(owner: symbol, active: boolean) {
  if (!active && playing !== owner) return
  playing = active ? owner : undefined
  for (const listener of listeners) listener()
}

export const isGalleryPlaying = () => playing !== undefined
export const subscribeToGallery = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
