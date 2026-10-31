import type { Db } from '@/server/db/client'
import { database } from '@/server/db/client'
import { readOwnerPlay } from '@/server/library/read'
import { readVersion, recordPlaySessions, type PlaySession } from '@/server/library/store'
import { forAccount } from '@/server/services/for-account'

/** A session as the app has it: of a game's file, by its entry, or of a Steam app it saw. */
export type SentSession = Omit<PlaySession, 'entryId'> & {
  game: { entry: string } | { steam: string }
}

/** Each Steam app's game, the one that owns it winning over one IGDB merely lists it for. */
const gamesBySteamApp = (games: readonly { entryId: string; steam: readonly string[] }[]) => {
  const byApp = new Map<string, string>()
  for (const { entryId, steam } of games) {
    for (const app of steam) if (!byApp.has(app)) byApp.set(app, entryId)
  }
  for (const { entryId, steam } of games) {
    if (steam[0]) byApp.set(steam[0], entryId)
  }
  return byApp
}

/**
 * Finds each session's game and keeps it, answering with the ids kept. The app knows a Steam game
 * only by its app, whether or not it is on the shelf, so its game is found here.
 */
export const placeAndKeep = async (db: Db, libraryId: string, sessions: readonly SentSession[]) => {
  const apps = sessions.some((session) => 'steam' in session.game)
    ? gamesBySteamApp(await readOwnerPlay(db, libraryId))
    : new Map<string, string>()
  const placed = sessions.flatMap(({ game, ...session }): PlaySession[] => {
    const entryId = 'entry' in game ? game.entry : apps.get(game.steam)
    return entryId ? [{ ...session, entryId }] : []
  })
  return recordPlaySessions(db, libraryId, placed)
}

/** For the route: on the signed-in account's library. */
export const keepPlaySessions = (sessions: readonly SentSession[]) =>
  forAccount(async (account) => {
    const db = database()
    const kept = await placeAndKeep(db, account.id, sessions)
    return { kept, version: await readVersion(db, account.id) }
  }, true)
