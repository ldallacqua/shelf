/**
 * Tauri's global, as Shelf for Windows puts it on Shelf's pages (ADR 005,
 * section 3): the only code that knows it. Outside the app there is none,
 * and a page goes on as it does in any browser. It imports nothing, so the
 * window's controls in every page's header cost a visitor next to nothing;
 * the commands that answer with data are in `bridge.ts`, which reads each
 * answer through a schema.
 */

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

let standIn: Invoke | null | undefined

/**
 * For tests: the app's commands answered by `invoke`, or no app at all
 * (`null`). `undefined` puts Tauri's own back.
 */
export const setBridgeForTests = (invoke: Invoke | null | undefined) => {
  standIn = invoke
}

const tauri = (): Invoke | undefined => {
  if (standIn !== undefined) return standIn ?? undefined
  if (typeof window === 'undefined') return undefined
  return (window as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke
}

/** Whether this page is inside Shelf for Windows. */
export const inDesktopApp = (): boolean => tauri() !== undefined

/**
 * Whether this page's window has no Windows bar, so Shelf's header is its bar
 * (ADR 005, section 8): the app says so before the page's scripts run, and
 * the head script puts it on <html> (`window-script.tsx`).
 */
export const framelessWindow = (): boolean =>
  inDesktopApp() && document.documentElement.getAttribute('data-window') === 'frameless'

/** Why the app did nothing, in its own words (`desktop/src/commands.rs`). */
export const refusals = ['invalid', 'unset', 'missing', 'refused', 'failed'] as const
export type Refusal = (typeof refusals)[number]

/** A command's refusal as a word; anything else it throws is `failed`. */
export const refusalOf = (error: unknown): Refusal =>
  refusals.find((refusal) => refusal === error) ?? 'failed'

/** Asks the app; outside it, refused as `failed`. */
export const call = async (command: string, args: Record<string, unknown> = {}) => {
  const invoke = tauri()
  if (!invoke) throw 'failed'
  return invoke(command, args)
}

const changes = new Set<() => void>()

/** Calls `listener` whenever a game's file is chosen or forgotten on this page; returns what stops it. */
export const onLaunchersChange = (listener: () => void): (() => void) => {
  changes.add(listener)
  return () => {
    changes.delete(listener)
  }
}

/** Says a game's file was chosen or forgotten, to whatever reads what is ready to play. */
export const launchersChanged = () => {
  for (const listener of changes) listener()
}

/** The window this page is in: Tauri's own window commands, allowed to Shelf's pages. */
export const appWindow = {
  minimize: async (): Promise<void> => {
    await call('plugin:window|minimize')
  },
  toggleMaximize: async (): Promise<void> => {
    await call('plugin:window|toggle_maximize')
  },
  close: async (): Promise<void> => {
    await call('plugin:window|close')
  },
  isMaximized: async (): Promise<boolean> => (await call('plugin:window|is_maximized')) === true,
}
