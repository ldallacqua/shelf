/**
 * Whether the library has been taken over by React on this device.
 *
 * False while the server builds the page and while the browser brings that
 * page to life; true from then on, including when the library is opened again
 * without a reload. A component reads it once, when it joins the page, to
 * tell "I came with the page" from "I was added on the device".
 *
 * It is a plain flag and not a subscription on purpose. Nothing has to be
 * drawn again when it flips: asking every cover on the first screen to redraw
 * at that moment was a tenth of a second of blocked phone.
 */
let live = false

export const pageIsLive = (): boolean => live

/** Called from an effect, once the first screen is alive. */
export const markPageLive = (): void => {
  live = true
}

/** For tests: back to a page that has not come alive yet. */
export const resetPageLive = (): void => {
  live = false
}
