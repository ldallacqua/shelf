import { collapsedScript } from './collapsed-script'
import { preferenceScript } from './preferences'

/**
 * Applies this device's library choices before the first paint, and hides
 * the shelves folded away on it. Render it in <head>, from a server
 * component only.
 */
export function PreferenceScript() {
  // Two statements: without the `;`, the first one's `})()` runs into the second's `try`.
  return (
    <script dangerouslySetInnerHTML={{ __html: `${preferenceScript()};${collapsedScript()}` }} />
  )
}
