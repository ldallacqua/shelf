/**
 * Shelf for Windows says, before any of the page's scripts run, when its
 * window has no Windows bar (ADR 005, section 8). This puts that on <html>
 * as `data-window="frameless"` before the first paint, so the header keeps
 * room for the window's controls from the start (the `frameless` variant in
 * `globals.css`). Anywhere else it does nothing. It must never throw.
 */
export const windowScript =
  "try{if(window.__SHELF_WINDOW__==='frameless')document.documentElement.setAttribute('data-window','frameless')}catch(e){}"

/** Render it in <head>, from a server component only. */
export function WindowScript() {
  return <script dangerouslySetInnerHTML={{ __html: windowScript }} />
}
