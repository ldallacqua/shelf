import { z } from 'zod'

import { call } from './tauri'

const readySchema = z.object({ version: z.string() }).nullable()

/** A newer Shelf for Windows, downloaded while the app ran and waiting to go in. */
export type Ready = NonNullable<z.infer<typeof readySchema>>

/**
 * Updates found while the app runs (ADR 005, section 9, `desktop/src/updates.rs`): the app looks
 * now and then and downloads what it finds; the page offers it, and the owner says when.
 */
export const updates = {
  /** The version waiting, or null. An app older than 0.16.0 has no such command, and refuses. */
  ready: async (): Promise<Ready | null> => readySchema.parse(await call('update_ready')),
  /** Ends the app, installs the update and opens Shelf again: it returns only when it could not. */
  install: async (): Promise<void> => {
    await call('install_update')
  },
}
