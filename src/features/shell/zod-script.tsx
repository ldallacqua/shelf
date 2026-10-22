/**
 * Turns off Zod's compiled checks in the browser before any of the page's
 * code runs. Zod compiles them with `new Function`, after first trying
 * whether it may; the site's content security policy refuses it
 * (architecture, section 20), and the browser reports even a refusal Zod
 * catches. Zod keeps its settings on this global, and keeps one already
 * there. Set here, it costs the pages nothing: importing Zod to set it would
 * put Zod on every page. `e2e/security.spec.ts` fails if Zod ever stops
 * reading it.
 *
 * Render it in <head>, from a server component only, as `ThemeScript` is.
 */
export function ZodScript() {
  return (
    <script dangerouslySetInnerHTML={{ __html: 'globalThis.__zod_globalConfig={jitless:true}' }} />
  )
}
