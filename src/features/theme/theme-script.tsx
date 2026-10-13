import { themeScript } from './theme'

/**
 * Applies the stored theme before the first paint. Render it in <head>, from a
 * server component only: React does not run a script it renders in the browser.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
}
