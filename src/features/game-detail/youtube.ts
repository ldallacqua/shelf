/** Only the on-demand player imports this adapter. Loading a gallery alone never loads Google's script. */
export type YoutubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  destroy: () => void
  getIframe: () => HTMLIFrameElement
}

export type YoutubeOptions = {
  host: string
  videoId: string
  width: string
  height: string
  playerVars: Record<string, string | number>
  events: {
    onReady: (event: { target: YoutubePlayer }) => void
    onStateChange: (event: { data: number }) => void
    onError: () => void
    onAutoplayBlocked: () => void
  }
}
type Youtube = { Player: new (element: HTMLElement, options: YoutubeOptions) => YoutubePlayer }
type YoutubeWindow = Window & { YT?: Youtube; onYouTubeIframeAPIReady?: () => void }
let pending: Promise<Youtube> | undefined

export function loadYoutube(): Promise<Youtube> {
  const page = window as YoutubeWindow
  if (page.YT?.Player) return Promise.resolve(page.YT)
  if (pending) return pending
  pending = new Promise<Youtube>((resolve, reject) => {
    const script = document.createElement('script')
    const previous = page.onYouTubeIframeAPIReady
    const timer = window.setTimeout(failed, 20_000)
    function failed() {
      window.clearTimeout(timer)
      script.remove()
      page.onYouTubeIframeAPIReady = previous
      pending = undefined
      reject(new Error('Video player unavailable'))
    }
    page.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      previous?.()
      if (page.YT?.Player) resolve(page.YT)
      else failed()
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = failed
    document.head.append(script)
  })
  return pending
}
