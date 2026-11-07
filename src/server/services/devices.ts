import { database } from '@/server/db/client'
import { readDevices } from '@/server/library/read'
import { nameDevice, readVersion } from '@/server/library/store'
import { forAccount } from '@/server/services/for-account'

/**
 * My computers with Shelf for Windows (ADR 005, section 12), for my account alone: which played
 * what, and the names I give them, are never in a library file or a public answer.
 */

/** For the route: the signed-in account's computers, in the order Shelf first heard of them. */
export const myDevices = () => forAccount((account) => readDevices(database(), account.id))

/** For the route: names one of the signed-in account's computers, or takes its name away. */
export const renameDevice = (deviceId: string, name: string | null) =>
  forAccount(async (account) => {
    const db = database()
    await nameDevice(db, account.id, deviceId, name || null)
    return { version: await readVersion(db, account.id) }
  }, true)
