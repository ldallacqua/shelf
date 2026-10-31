/** The cookie set at sign-in: that someone is signed in on this browser, never who. Named here too: `useAccount` is the browser's, and this runs before it. */
export const HINT = 'shelf_signed_in'

/** Marks <html> for the `hinted:` variant, which a page built ahead for a visitor can answer to. */
export const hintScript = `/(^|; )${HINT}=1(;|$)/.test(document.cookie)&&(document.documentElement.dataset.hinted='')`

/**
 * Says so before the first paint, so the header does not offer someone signed
 * in the way in while the browser gets ready to ask who it is. Render it in
 * <head>, from a server component only: React does not run a script it renders
 * in the browser.
 */
export function AccountHintScript() {
  return <script dangerouslySetInnerHTML={{ __html: hintScript }} />
}
