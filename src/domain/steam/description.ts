import { isSteamClip, isSteamPicture } from '@/domain/igdb/images'

/**
 * A game's long description from its page on Steam's store (ADR 010, decision 11): what its page
 * shows under About, before IGDB's summary. The store writes it in BBCode; this reads the few tags
 * store pages use into blocks Shelf draws itself, so none of the store's markup reaches a page, no
 * link leads anywhere, and a picture is kept only when it is a file on Steam's own servers.
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

/** More than any store page surveyed on 11 Nov 2026 (66 popular games, the longest 8,377 characters). */
const MAX_BLOCKS = 400
const MAX_PICTURES = 60
const MAX_TEXT = 30_000

/** Where Steam keeps a page's own files, as its descriptions name them. */
const APP_FILES = '{STEAM_APP_IMAGE}/'
const STEAM_HOSTS = [
  /^https?:\/\/(?:shared|cdn|media)\.(?:akamai|cloudflare|fastly)\.steamstatic\.com\/(?:store_item_assets\/)?/i,
  /^https?:\/\/steamcdn-a\.akamaihd\.net\//i,
]

/** A file's path on Steam's servers, from the address a description gives; nothing for any other server. */
const pathOn = (address: string | undefined, app: string): string | undefined => {
  const bare = address?.trim().split(/[?#]/)[0]
  if (!bare) return undefined
  if (bare.startsWith(APP_FILES)) return `steam/apps/${app}/${bare.slice(APP_FILES.length)}`
  const host = STEAM_HOSTS.find((each) => each.test(bare))
  return host ? bare.replace(host, '') : undefined
}

const size = (value: string | undefined): number | undefined => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 10_000 ? number : undefined
}

const ATTRIBUTE = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g

const attributesOf = (text: string): Record<string, string> => {
  const found: Record<string, string> = {}
  // `[url=…]` names its value without a key.
  const bare = /^=\s*(?:"([^"]*)"|(\S+))/.exec(text)
  if (bare) found[''] = bare[1] ?? bare[2] ?? ''
  for (const match of text.matchAll(ATTRIBUTE)) {
    found[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return found
}

/** A picture from an `[img]`'s attributes, or from the address between its tags. */
const pictureOf = (
  attributes: Record<string, string>,
  between: string | undefined,
  app: string,
  mature: boolean,
): DescriptionPicture | undefined => {
  const at = (key: string) => pathOn(attributes[key], app)
  // A clip's still is its poster; an animated picture's too, where it has one.
  const still = [at('poster'), at('src'), at(''), pathOn(between, app)].find(
    (path) => path !== undefined && isSteamPicture(path),
  )
  if (!still) return undefined
  const mp4 = at('mp4')
  const webm = at('webm')
  const loop = {
    ...(mp4 && isSteamClip(mp4) ? { mp4 } : {}),
    ...(webm && isSteamClip(webm) ? { webm } : {}),
  }
  const width = size(attributes.width)
  const height = size(attributes.height)
  return {
    id: still,
    ...(width && height ? { width, height } : {}),
    ...(loop.mp4 || loop.webm ? { loop } : {}),
    ...(mature ? { mature: true as const } : {}),
  }
}

type Style = Omit<Run, 'text'>

const sameStyle = (a: Style, b: Style) =>
  a.strong === b.strong && a.em === b.em && a.underline === b.underline && a.strike === b.strike

/**
 * Runs as they are drawn: spaces and tabs folded, a line break kept bare, nothing at either end,
 * neighbours set alike joined. Nothing when there is no text to read.
 */
const tidy = (runs: readonly Run[]): Run[] | undefined => {
  const out: Run[] = []
  for (const run of runs) {
    const text = run.text.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n')
    if (!text) continue
    const last = out.at(-1)
    if (last && sameStyle(last, run)) last.text += text
    else out.push({ ...run, text })
  }
  while (out[0] && !out[0].text.trimStart()) out.shift()
  while (out.at(-1) && !out.at(-1)!.text.trimEnd()) out.pop()
  if (out.length === 0) return undefined
  out[0]!.text = out[0]!.text.trimStart()
  out.at(-1)!.text = out.at(-1)!.text.trimEnd()
  return out
}

/** A blank line ends a paragraph. */
const BLANK_LINE = /\n[ \t ]*\n\s*/

const BLOCK_TAGS = new Set(['p', 'hr', 'quote', 'code', 'table', 'tr'])
const LIST_TAGS = new Set(['list', 'ul', 'olist', 'ol'])
const STYLE_OF: Record<string, keyof Style> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  u: 'underline',
  s: 'strike',
  strike: 'strike',
}
/** Tags whose words are kept and whose meaning is not: a link's text stays, its address goes. */
const PLAIN_TAGS = new Set(['url', 'spoiler', 'expand', 'td', 'th', 'noparse', 'previewyoutube'])
const PICTURE_TAGS = new Set(['img', 'video'])

/** BBCode's tags, and a bracket the writer escaped. */
const TOKEN = /\\([[\]])|\[(\/?)([a-z][a-z0-9]*|\*)((?:[ =][^\]]*)?)\]/gi

/**
 * A store page's description, read from its BBCode, for the app it belongs to: `{STEAM_APP_IMAGE}`
 * is that app's folder. A game for adults has every picture marked. Nothing when nothing is left.
 */
export const readDescription = (
  bbcode: string,
  app: string,
  mature = false,
): Description | undefined => {
  const source = bbcode.replace(/\r\n?/g, '\n')
  const blocks: Description = []
  const styles: Record<keyof Style, number> = { strong: 0, em: 0, underline: 0, strike: 0 }
  let runs: Run[] = []
  let list: { ordered: boolean; items: Run[][]; depth: number } | undefined
  let heading: string | undefined
  /** An `[img]` that names its address between its tags, being read. */
  let picture: { attributes: Record<string, string>; between: string } | undefined
  let noparse = false
  let text = 0
  let pictures = 0

  const push = (block: DescriptionBlock) => {
    if (blocks.length < MAX_BLOCKS) blocks.push(block)
  }

  const write = (words: string) => {
    if (!words || text > MAX_TEXT) return
    if (picture) {
      picture.between += words
      return
    }
    if (heading !== undefined) {
      heading += words
      return
    }
    text += words.length
    const style: Style = {
      ...(styles.strong > 0 ? { strong: true } : {}),
      ...(styles.em > 0 ? { em: true } : {}),
      ...(styles.underline > 0 ? { underline: true } : {}),
      ...(styles.strike > 0 ? { strike: true } : {}),
    }
    const last = runs.at(-1)
    if (last && sameStyle(last, style)) last.text += words
    else runs.push({ ...style, text: words })
  }

  /** What was written since the last block: a list's item, or paragraphs. */
  const flow = () => {
    const written = runs
    runs = []
    if (list) {
      const item = tidy(
        written.map((run) => ({ ...run, text: run.text.replace(BLANK_LINE, '\n') })),
      )
      if (item) list.items.push(item)
      return
    }
    let paragraph: Run[] = []
    const end = () => {
      const tidied = tidy(paragraph)
      if (tidied) push({ kind: 'paragraph', runs: tidied })
      paragraph = []
    }
    for (const run of written) {
      run.text.split(BLANK_LINE).forEach((part, at) => {
        if (at > 0) end()
        paragraph.push({ ...run, text: part })
      })
    }
    end()
  }

  const endList = () => {
    flow()
    if (list && list.items.length > 0) {
      push({ kind: 'list', ...(list.ordered ? { ordered: true as const } : {}), items: list.items })
    }
    list = undefined
  }

  const addPicture = (attributes: Record<string, string>, between?: string) => {
    if (pictures >= MAX_PICTURES) return
    const found = pictureOf(attributes, between, app, mature)
    if (!found) return
    pictures += 1
    push({ kind: 'picture', ...found })
  }

  let at = 0
  for (const match of source.matchAll(TOKEN)) {
    const [whole, escaped, closing, rawName, rest] = match
    write(source.slice(at, match.index))
    at = match.index + whole.length
    if (escaped) {
      write(escaped)
      continue
    }
    const name = rawName!.toLowerCase()
    const closes = closing === '/'
    if (noparse && !(closes && name === 'noparse')) {
      write(whole)
      continue
    }
    if (picture) {
      if (closes && PICTURE_TAGS.has(name)) {
        addPicture(picture.attributes, picture.between)
        picture = undefined
      } else picture.between += whole
      continue
    }

    if (name === 'noparse') noparse = !closes
    else if (STYLE_OF[name]) {
      const style = STYLE_OF[name]
      styles[style] = closes ? Math.max(0, styles[style] - 1) : styles[style] + 1
    } else if (PICTURE_TAGS.has(name)) {
      if (closes) continue
      // A picture stands alone: whatever was being written ends before it.
      endList()
      const attributes = attributesOf(rest ?? '')
      if (attributes.src || attributes[''] || attributes.poster) addPicture(attributes)
      else picture = { attributes, between: '' }
    } else if (/^h[1-6]$/.test(name)) {
      if (closes) {
        const words = (heading ?? '').replace(/\s+/g, ' ').trim()
        if (words) {
          text += words.length
          push({ kind: 'heading', text: words })
        }
        heading = undefined
      } else {
        endList()
        heading = ''
      }
    } else if (LIST_TAGS.has(name)) {
      if (closes) {
        if (list && --list.depth === 0) endList()
      } else if (list) list.depth += 1
      else {
        flow()
        list = { ordered: name === 'olist' || name === 'ol', items: [], depth: 1 }
      }
    } else if (name === '*') {
      // Each item ends where the next begins, closed or not.
      flow()
    } else if (BLOCK_TAGS.has(name)) {
      // Inside a list's item, a paragraph's tags only wrap its words.
      if (!list) flow()
    } else if (!PLAIN_TAGS.has(name)) {
      // Not a tag store pages use: it was text.
      write(whole)
    }
  }
  write(source.slice(at))
  if (picture) addPicture(picture.attributes, picture.between)
  endList()

  return blocks.length > 0 ? blocks : undefined
}

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
