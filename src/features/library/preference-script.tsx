import { preferenceScript } from './preferences'

/**
 * Applies this device's library choices before the first paint. Render it in
 * <head>, from a server component only.
 */
export function PreferenceScript() {
  return <script dangerouslySetInnerHTML={{ __html: preferenceScript() }} />
}
