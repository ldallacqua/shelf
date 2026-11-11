import { isSteamImage } from '@/domain/igdb/images'

/**
 * How a library's cover stands in its frame (issue 193). Covers come in two shapes: Steam's
 * capsules are 2:3, and IGDB asks for 3:4. A frame is 2:3, the shape most covers have once a
 * game's store page comes first (ADR 010): a cover of that shape fills it, and any other is
 * drawn whole inside it, over its own colors, so nothing is ever cut from a cover's logo.
 */

/** The shape of the frame a library's covers stand in, width over height. */
export const COVER_FRAME = 2 / 3

/** How far a cover's shape may be from its frame's and still fill it: a crop too small to see. */
const FILL_WITHIN = 0.05

/** Width over height of a capsule on Steam's store, times 100, as `coverRatio` keeps it. */
const STEAM_CAPSULE = 67

/**
 * A cover's shape, times 100: the one the library file knows, or a capsule's for one from
 * Steam. Nothing for an IGDB cover whose shape isn't known, such as a version's.
 */
export const ratioOfCover = (cover: string | undefined, known?: number): number | undefined =>
  known ?? (cover && isSteamImage(cover) ? STEAM_CAPSULE : undefined)

export type CoverFit = 'fill' | 'whole'

/** Whether a cover fills its frame or is drawn whole inside it. A shape not known is drawn whole. */
export const coverFit = (ratio: number | undefined, frame = COVER_FRAME): CoverFit =>
  ratio !== undefined && Math.abs(ratio / 100 - frame) / frame <= FILL_WITHIN ? 'fill' : 'whole'
