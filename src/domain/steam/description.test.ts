import { describe, expect, it } from 'vitest'

import { foldDescription, type Description } from './description'
import { readDescription } from './read-description'

/**
 * Store pages' BBCode, written by hand in the shapes `GetItems` answered for 66 games on
 * 11 Nov 2026: headings and blank lines, `[p]` wrappers with Windows line ends, lists whose
 * items close or don't, clips with their posters, and brackets the writer escaped.
 */

const APP = '400'
const FILES = `steam/apps/${APP}/extras`

describe('reading a store page’s description', () => {
  it('reads headings, paragraphs and line breaks', () => {
    const blocks = readDescription(
      '[h2]STORY[/h2]\n\nA lighthouse keeper  finds a door.\nIt was not there yesterday.\n\n[h2]ABOUT[/h2]\n\nShort and strange.',
      APP,
    )
    expect(blocks).toEqual([
      { kind: 'heading', text: 'STORY' },
      {
        kind: 'paragraph',
        runs: [{ text: 'A lighthouse keeper finds a door.\nIt was not there yesterday.' }],
      },
      { kind: 'heading', text: 'ABOUT' },
      { kind: 'paragraph', runs: [{ text: 'Short and strange.' }] },
    ])
  })

  it('keeps bold, italic, underlined and struck words, and folds the indentation away', () => {
    const blocks = readDescription(
      '\t\t\t[b]Tides[/b] is a [i]slow[/i] game, [u]really[/u] [strike]fast[/strike].\n\t\t\t\n\t\t\tNext.',
      APP,
    )
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { text: 'Tides', strong: true },
          { text: ' is a ' },
          { text: 'slow', em: true },
          { text: ' game, ' },
          { text: 'really', underline: true },
          { text: ' ' },
          { text: 'fast', strike: true },
          { text: '.' },
        ],
      },
      { kind: 'paragraph', runs: [{ text: 'Next.' }] },
    ])
  })

  it('reads lists, with items closed or not, and paragraphs inside them', () => {
    const blocks = readDescription(
      '[list][*][p]Forty islands\r\n[/p][/*][*]Six seasons\r\n[*][b]One[/b] boat[/list][olist][*]First[*]Second[/olist]',
      APP,
    )
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [
          [{ text: 'Forty islands' }],
          [{ text: 'Six seasons' }],
          [{ text: 'One', strong: true }, { text: ' boat' }],
        ],
      },
      { kind: 'list', ordered: true, items: [[{ text: 'First' }], [{ text: 'Second' }]] },
    ])
  })

  it('takes [p] wrappers as paragraphs, and leaves the empty ones out', () => {
    const blocks = readDescription(
      '[p][b]Bold opening.[/b]\r\n[/p][p]\r\n[/p][p]\r\n[/p][p align="center"]Then this.[/p]',
      APP,
    )
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Bold opening.', strong: true }] },
      { kind: 'paragraph', runs: [{ text: 'Then this.' }] },
    ])
  })

  it('reads a picture on the store’s servers, with its size', () => {
    const blocks = readDescription(
      `Before.[img src="{STEAM_APP_IMAGE}/extras/a1.avif" width="616" height="924" avif="{STEAM_APP_IMAGE}/extras/a1.avif" fromclient=1][/img]After.`,
      APP,
    )
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Before.' }] },
      { kind: 'picture', id: `${FILES}/a1.avif`, width: 616, height: 924 },
      { kind: 'paragraph', runs: [{ text: 'After.' }] },
    ])
  })

  it('reads a clip as its poster and its files', () => {
    const [clip, animated] = readDescription(
      `[img src="{STEAM_APP_IMAGE}/extras/c2.poster.avif" poster="{STEAM_APP_IMAGE}/extras/c2.poster.avif" width="600" height="338" mp4="{STEAM_APP_IMAGE}/extras/c2.mp4" webm="{STEAM_APP_IMAGE}/extras/c2.webm" fromclient=1][/img]` +
        `[img src="{STEAM_APP_IMAGE}/extras/d5.webp" poster="{STEAM_APP_IMAGE}/extras/d5.poster.avif" width="780" height="190" webm="{STEAM_APP_IMAGE}/extras/d5.webm" webp="{STEAM_APP_IMAGE}/extras/d5.webp" fromclient=1][/img]`,
      APP,
    )!
    expect(clip).toEqual({
      kind: 'picture',
      id: `${FILES}/c2.poster.avif`,
      width: 600,
      height: 338,
      loop: { mp4: `${FILES}/c2.mp4`, webm: `${FILES}/c2.webm` },
    })
    // An animated picture's still is its poster, and its clip what moves.
    expect(animated).toEqual({
      kind: 'picture',
      id: `${FILES}/d5.poster.avif`,
      width: 780,
      height: 190,
      loop: { webm: `${FILES}/d5.webm` },
    })
  })

  it('reads an older picture named between its tags, on any of Steam’s image servers', () => {
    const blocks = readDescription(
      '[img]https://cdn.akamai.steamstatic.com/steam/apps/400/extras/old.gif?t=12[/img]',
      APP,
    )
    expect(blocks).toEqual([{ kind: 'picture', id: `${FILES}/old.gif` }])
  })

  it('leaves out pictures on any other server, and paths that leave the app’s folder', () => {
    const blocks = readDescription(
      '[img]https://example.com/steam/apps/400/extras/a.png[/img]' +
        '[img src="https://evil.example/{STEAM_APP_IMAGE}/a.png"][/img]' +
        '[img src="{STEAM_APP_IMAGE}/../../other/a.png"][/img]' +
        '[img src="{STEAM_APP_IMAGE}/extras/page.html"][/img]' +
        'Words stay.',
      APP,
    )
    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'Words stay.' }] }])
  })

  it('marks every picture of a game for adults', () => {
    const blocks = readDescription('[img src="{STEAM_APP_IMAGE}/extras/a.jpg"][/img]', APP, true)
    expect(blocks).toEqual([{ kind: 'picture', id: `${FILES}/a.jpg`, mature: true }])
  })

  it('keeps a link’s words and drops where it leads', () => {
    const blocks = readDescription(
      'Join [url=https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fexample.com]our server[/url] today.',
      APP,
    )
    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'Join our server today.' }] }])
  })

  it('reads an escaped bracket, and a tag it does not know, as words', () => {
    const blocks = readDescription('\\[Features] and [Note] and [x=1]stay', APP)
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: '[Features] and [Note] and [x=1]stay' }] },
    ])
  })

  it('leaves nothing for a description with no words or pictures', () => {
    expect(readDescription('[p]\r\n[/p][list][/list][h2] [/h2]', APP)).toBeUndefined()
    expect(readDescription('', APP)).toBeUndefined()
  })

  it('keeps no markup a page could run', () => {
    const blocks = readDescription('<script>alert(1)</script>[b]<img src=x>[/b]', APP)
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: '<script>alert(1)</script>' }, { text: '<img src=x>', strong: true }],
      },
    ])
  })
})

describe('folding a long description', () => {
  const words = (length: number) => ({
    kind: 'paragraph' as const,
    runs: [{ text: 'w'.repeat(length) }],
  })
  const heading = { kind: 'heading' as const, text: 'HEADING' }
  const clip = {
    kind: 'picture' as const,
    id: `${FILES}/c.poster.avif`,
    width: 600,
    height: 338,
  }

  it('shows the first paragraph even under a picture, then folds', () => {
    const blocks: Description = [clip, words(300), heading, words(300), words(300)]
    const { first, rest } = foldDescription(blocks, 420, 200)
    expect(first).toEqual([clip, words(300)])
    expect(rest).toEqual([heading, words(300), words(300)])
  })

  it('never leaves a heading as the last thing before the fold', () => {
    // 415 characters, then the heading reaches the mark.
    const blocks: Description = [words(200), words(215), heading, words(400), words(400)]
    const { first, rest } = foldDescription(blocks, 420, 200)
    expect(first).toEqual([words(200), words(215)])
    expect(rest[0]).toEqual(heading)
  })

  it('shows a sliver left over, but folds a picture away', () => {
    expect(foldDescription([words(500), words(100)], 420, 200).rest).toEqual([])
    expect(foldDescription([words(500), clip], 420, 200).rest).toEqual([clip])
  })
})
