import { parentOf, type FamilyLink, type LineageStep } from '@/domain/igdb/game'
import type { IgdbLineage } from '@/domain/igdb/schema'
import type { Relation } from '@/domain/library/values'

/**
 * ADR 001, decision 4: when a game being added is related to one already on
 * the shelf, propose what to do. IGDB keeps editions, ports, remasters and
 * remakes as separate records that point up to an original; this file reads
 * those pointers and nothing else.
 */

/** A record and the chain of records above it, nearest first. */
export type FamilyMember = {
  igdbId: number
  lineage: readonly LineageStep[]
}

/** How far apart two versions are. A higher number is less "the same game". */
const DISTANCE: Record<FamilyLink, number> = {
  edition: 0,
  port: 1,
  remaster: 2,
  expanded: 2,
  remake: 3,
}

const MAX_DEPTH = 8

/**
 * The chain from a record up to the top of its family. `lookup` supplies the
 * records above it; a missing one ends the chain there.
 */
export const buildLineage = (
  record: IgdbLineage,
  lookup: (igdbId: number) => IgdbLineage | undefined,
): LineageStep[] => {
  const lineage: LineageStep[] = []
  const seen = new Set([record.id])
  let current: IgdbLineage | undefined = record
  while (current && lineage.length < MAX_DEPTH) {
    const step = parentOf(current)
    // IGDB's relations are edited by hand and can loop.
    if (!step || seen.has(step.igdbId)) break
    lineage.push(step)
    seen.add(step.igdbId)
    current = lookup(step.igdbId)
  }
  return lineage
}

/** The ids a lineage lookup will need, for the one request that fetches them. */
export const idsAbove = (record: IgdbLineage): number[] => {
  const step = parentOf(record)
  return step ? [step.igdbId] : []
}

const farther = (a: FamilyLink | undefined, b: FamilyLink): FamilyLink =>
  a === undefined || DISTANCE[b] > DISTANCE[a] ? b : a

/**
 * How two records are related: the farthest link on the path between them
 * through their nearest shared ancestor. Undefined when they share none.
 *
 * An edition of a remake is an edition (same game); a port of an original and
 * a remake of that original are a remake apart.
 */
export const linkBetween = (a: FamilyMember, b: FamilyMember): FamilyLink | undefined => {
  if (a.igdbId === b.igdbId) return 'edition'

  // For each record on b's way up: the farthest link b crossed to get there.
  const fromB = new Map<number, FamilyLink | undefined>([[b.igdbId, undefined]])
  let crossed: FamilyLink | undefined
  for (const step of b.lineage) {
    crossed = farther(crossed, step.via)
    fromB.set(step.igdbId, crossed)
  }

  const meet = (igdbId: number, crossedByA: FamilyLink | undefined) => {
    if (!fromB.has(igdbId)) return undefined
    const crossedByB = fromB.get(igdbId)
    if (crossedByA === undefined) return crossedByB
    return crossedByB === undefined ? crossedByA : farther(crossedByA, crossedByB)
  }

  let crossedByA: FamilyLink | undefined
  const direct = meet(a.igdbId, crossedByA)
  if (direct) return direct
  for (const step of a.lineage) {
    crossedByA = farther(crossedByA, step.via)
    const link = meet(step.igdbId, crossedByA)
    if (link) return link
  }
  return undefined
}

export type Proposal =
  /** This exact record is already linked to an entry. */
  | { action: 'already'; entryId: string }
  /** Nothing related is on the shelf. */
  | { action: 'new' }
  /** Default: fold it into the related entry. `ask` says whether to confirm first. */
  | { action: 'join'; entryId: string; relation: Relation; because: FamilyLink; ask: boolean }
  /** Default: its own entry, but a related one exists, so ask. */
  | { action: 'separate'; entryId: string; relation: Relation; because: FamilyLink; ask: true }

export type LinkedMember = FamilyMember & { entryId: string }

/**
 * | Link               | Default                    |
 * | ------------------ | -------------------------- |
 * | Edition, port      | Same entry, silently       |
 * | Remaster, expanded | Same entry, asks first     |
 * | Remake             | Separate entry, asks first |
 */
export const proposeGrouping = (
  candidate: FamilyMember,
  linked: readonly LinkedMember[],
): Proposal => {
  const same = linked.find((member) => member.igdbId === candidate.igdbId)
  if (same) return { action: 'already', entryId: same.entryId }

  let nearest: { entryId: string; link: FamilyLink } | undefined
  for (const member of linked) {
    const link = linkBetween(candidate, member)
    if (link && (!nearest || DISTANCE[link] < DISTANCE[nearest.link])) {
      nearest = { entryId: member.entryId, link }
    }
  }
  if (!nearest) return { action: 'new' }

  // What the new record is, in its own right: an edition, a port, and so on.
  // The original of a port I already own has no link of its own, so "other".
  const relation: Relation = candidate.lineage[0]?.via ?? 'other'
  const { entryId, link } = nearest

  if (link === 'remake') {
    return { action: 'separate', entryId, relation, because: link, ask: true }
  }
  return {
    action: 'join',
    entryId,
    relation,
    because: link,
    ask: link === 'remaster' || link === 'expanded',
  }
}
