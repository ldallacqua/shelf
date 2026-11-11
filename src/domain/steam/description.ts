/**
 * A game's long description from its page on Steam's store (ADR 010, decision 11): what its page
 * shows under About, before IGDB's summary, as the blocks Shelf draws. `read-description.ts` reads
 * them from the store's BBCode, on the server only: a page needs these, and not the reading.
 */

/** A stretch of text and how it is set. A line break inside it is the writer's own. */
export type Run = { text: string; strong?: true; em?: true; underline?: true; strike?: true }

export type DescriptionPicture = {
  /** The still, as a path on Steam's servers (`steamFileUrl`): a clip's poster. */
  id: string
  width?: number
  height?: number
  /** A clip that plays in its place, looping and silent, as a GIF would. */
  loop?: { mp4?: string; webm?: string }
  /** The store marks the game for adults: drawn blurred until asked for (ADR 010, decision 7). */
  mature?: true
}

export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'list'; ordered?: true; items: Run[][] }
  | ({ kind: 'picture' } & DescriptionPicture)

export type Description = DescriptionBlock[]

/**
 * Whether a description says anything in words. Some store pages are pictures with their words
 * drawn in: a screen reader would find nothing there.
 */
export const hasWords = (blocks: Description): boolean =>
  blocks.some((block) => block.kind === 'paragraph' || block.kind === 'list')

/** How a block weighs on the page, in characters of prose: a picture by the height it is drawn at. */
const weightOf = (block: DescriptionBlock): number => {
  const length = (runs: readonly Run[]) => runs.reduce((sum, run) => sum + run.text.length, 0)
  switch (block.kind) {
    case 'heading':
      return block.text.length
    case 'paragraph':
      return length(block.runs)
    case 'list':
      return block.items.reduce((sum, item) => sum + length(item) + 20, 0)
    case 'picture':
      // About three characters of prose to a pixel, in a column some 600 pixels wide.
      return block.width && block.height
        ? Math.round(Math.min(600, block.width) * (block.height / block.width) * 3)
        : 300
  }
}

/**
 * Where a long description folds behind "Read more": after its first paragraph of words and about
 * `shown` characters' worth of page, never right after a heading. Less than `hidden` characters
 * of words left over, with no picture among them, is shown too: hiding a sliver is worse.
 */
export const foldDescription = (
  blocks: Description,
  shown: number,
  hidden: number,
): { first: Description; rest: Description } => {
  let cut = 0
  let weight = 0
  let words = false
  while (cut < blocks.length && (!words || weight < shown)) {
    const block = blocks[cut]!
    weight += weightOf(block)
    if (block.kind === 'paragraph' || block.kind === 'list') words = true
    cut += 1
  }
  while (cut > 1 && blocks[cut - 1]!.kind === 'heading') cut -= 1
  const rest = blocks.slice(cut)
  const left = rest.reduce((sum, block) => sum + weightOf(block), 0)
  if (left < hidden && !rest.some((block) => block.kind === 'picture')) {
    return { first: [...blocks], rest: [] }
  }
  return { first: blocks.slice(0, cut), rest }
}
