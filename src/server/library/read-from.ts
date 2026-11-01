import { and, eq, gte, inArray, sql } from 'drizzle-orm'

import { storeOfSource } from '@/domain/library/store-choices'
import type { StoreName } from '@/domain/library/stores'
import type { SyncSource } from '@/domain/library/values'
import type { Executor } from '@/server/db/client'
import { platformLinks, sourceItems } from '@/server/db/schema'

/**
 * The accounts that say I own these copies: linked, and listing the game at
 * their last read. What they say is not mine to undo (spec 7.3): the copy stays
 * while they do. Unlink the account, or lose the game from it, and the copy is
 * like one I added by hand.
 */
export const accountsReading = async (
  db: Executor,
  libraryId: string,
  copyIds: readonly string[],
): Promise<Map<string, SyncSource[]>> => {
  const reading = new Map<string, SyncSource[]>()
  if (copyIds.length === 0) return reading
  const rows = await db
    .selectDistinct({ copyId: sourceItems.copyId, source: sourceItems.source })
    .from(sourceItems)
    .innerJoin(
      platformLinks,
      and(
        eq(platformLinks.userId, sourceItems.userId),
        eq(platformLinks.source, sourceItems.source),
      ),
    )
    .where(
      and(
        eq(sourceItems.userId, libraryId),
        inArray(sourceItems.copyId, [...copyIds]),
        gte(sourceItems.lastSeenAt, sql`coalesce(${platformLinks.readAt}, 0)`),
      ),
    )
  for (const { copyId, source } of rows) {
    if (copyId) reading.set(copyId, [...(reading.get(copyId) ?? []), source])
  }
  return reading
}

/** The stores those accounts are: where the copy is from, whatever else I say. */
export const storesOf = (accounts: readonly SyncSource[] = []): StoreName[] =>
  accounts.flatMap((source) => storeOfSource(source) ?? [])
