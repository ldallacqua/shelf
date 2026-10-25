import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ItemView, LinkView, NintendoLinkOutcome, SyncStep } from '@/domain/sync/link'
import { renderWithIntl } from '@/test/render'

import { Platforms } from './platforms'
import type { PlatformRow } from './sync-client'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/**
 * The account page's Platforms (ADR 003): Steam and Nintendo unlinked and
 * linked, a sync's steps, Nintendo's link pasted back, and the format
 * question for what Nintendo saw played.
 */

const LINK: LinkView = {
  source: 'steam',
  externalId: '76561190000000001',
  name: 'Ana on Steam',
  daily: true,
  linkedAt: 1,
  readAt: 2,
  syncedAt: 3,
  problem: null,
  counts: { 'on-shelf': 25, adding: 0, 'needs-you': 2, hidden: 0, notSeen: 0, unsorted: 0 },
}

const NINTENDO: LinkView = {
  ...LINK,
  source: 'nintendo',
  externalId: 'a0b1c2d3e4f5a6b7',
  name: 'Ana',
  counts: { 'on-shelf': 0, adding: 0, 'needs-you': 3, hidden: 0, notSeen: 0, unsorted: 0 },
}

const rows = (link: LinkView | null, nintendo: LinkView | null = null): PlatformRow[] => [
  { source: 'steam', ready: true, link },
  { source: 'playstation', ready: false, link: null },
  { source: 'xbox', ready: false, link: null },
  { source: 'nintendo', ready: true, link: nintendo },
]

const played = (id: string, title: string, match?: ItemView['match']): ItemView => ({
  id,
  title,
  storeId: id,
  minutes: 600,
  lastPlayedAt: 1,
  lastSeenAt: 2,
  state: 'needs-you',
  decision: 'pending',
  kind: null,
  ...(match ? { match } : {}),
})

/** What Nintendo saw played, waiting: two games Shelf matched, and one it could not. */
const PLAYED: ItemView[] = [
  played('kart', 'Mario Kart 8 Deluxe', {
    igdbId: 26764,
    title: 'Mario Kart 8 Deluxe',
    year: 2017,
    cover: null,
  }),
  played('dread', 'Metroid Dread', {
    igdbId: 15698,
    title: 'Metroid Dread',
    year: 2021,
    cover: null,
  }),
  played('world', 'Mario Kart World'),
]

const sent: { path: string; method: string; body?: unknown }[] = []
let platforms: PlatformRow[]
let steps: SyncStep[]
let pasted: NintendoLinkOutcome
/** What the needs-you list answers with. */
let listed: ItemView[]
/** Held, an answer about an item waits for it; failing, it is refused. */
let answerHeld: Promise<unknown> | undefined
let answerFails: boolean

beforeEach(() => {
  sent.length = 0
  steps = []
  pasted = 'linked'
  listed = PLAYED
  answerHeld = undefined
  answerFails = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/me/platforms') return Response.json(platforms)
    if (path.endsWith('/sync') || path.endsWith('/answers')) return Response.json(steps.shift())
    if (path === '/api/v1/me/platforms/nintendo/link') {
      // Linked, the platforms read again have the link in place.
      if (pasted === 'linked') platforms = rows(null, NINTENDO)
      return Response.json({ outcome: pasted })
    }
    if (path === '/api/v1/me/platforms/nintendo/items?list=needs-you') return Response.json(listed)
    if (path.startsWith('/api/v1/me/platforms/nintendo/items/')) {
      await answerHeld
      if (answerFails) return new Response(null, { status: 500 })
      return Response.json({ item: { ...PLAYED[0], state: 'on-shelf' }, version: 9 })
    }
    return new Response(null, { status: 404 })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('Platforms', () => {
  it('offers Steam’s own sign-in, and names what comes next', async () => {
    platforms = rows(null)
    renderWithIntl(<Platforms handle="ana" />, 'pt-BR')
    const signIn = await screen.findByRole('link', { name: 'Entrar pela Steam' })
    expect(signIn).toHaveAttribute('href', '/api/v1/me/platforms/steam/connect?locale=pt-BR')
    expect(screen.getByText('PlayStation e Xbox vêm a seguir.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'PlayStation' })).not.toBeInTheDocument()
  })

  it('shows a linked account’s games, and what needs an answer', async () => {
    platforms = rows(LINK)
    renderWithIntl(<Platforms handle="ana" />)
    expect(await screen.findByText('25 games on your shelf from Steam')).toBeInTheDocument()
    expect(screen.getByText('Linked to Ana on Steam')).toBeInTheDocument()
    expect(screen.getByText('2 games need you')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Sync once a day' })).toBeChecked()
  })

  it('leads to the page for placing the games it brought in that wait', async () => {
    platforms = rows({ ...LINK, counts: { ...LINK.counts, unsorted: 240 } })
    renderWithIntl(<Platforms handle="ana" />, 'pt-BR')
    const place = await screen.findByRole('link', { name: '240 jogos para organizar' })
    // The stand-in for the router writes every link in English.
    expect(place).toHaveAttribute('href', '/en/account/unsorted')
  })

  it('offers no such page while nothing waits', async () => {
    platforms = rows(LINK)
    renderWithIntl(<Platforms handle="ana" />)
    await screen.findByText('25 games on your shelf from Steam')
    expect(screen.queryByRole('link', { name: /to place/ })).not.toBeInTheDocument()
  })

  it('never says a sync was in the future, when the server’s clock runs ahead', async () => {
    platforms = rows({ ...LINK, syncedAt: Date.now() + 5000 })
    renderWithIntl(<Platforms handle="ana" />)
    await screen.findByText('25 games on your shelf from Steam')
    expect(screen.getByText(/^Last synced/)).not.toHaveTextContent(/in \d+ second/)
    expect(screen.getByText(/^Last synced/)).toHaveTextContent('Last synced now')
  })

  it('says how to fix an account that hides its games', async () => {
    platforms = rows({ ...LINK, problem: 'private' })
    renderWithIntl(<Platforms handle="ana" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Set Game details to Public/)
    expect(
      within(alert).getByRole('link', { name: 'your Steam privacy settings' }),
    ).toHaveAttribute('href', 'https://steamcommunity.com/my/edit/settings')
  })

  it('links straight to Steam’s privacy settings, in a tab of its own, named by its words', async () => {
    platforms = rows(null)
    renderWithIntl(<Platforms handle="ana" />, 'pt-BR')
    const settings = await screen.findByRole('link', {
      name: 'suas configurações de privacidade na Steam',
    })
    expect(settings).toHaveAttribute('href', 'https://steamcommunity.com/my/edit/settings')
    expect(settings).toHaveAttribute('target', '_blank')
    expect(settings.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('reads Steam first, then asks for steps until nothing is left', async () => {
    platforms = rows(LINK)
    const after = (added: number, remaining: number, adding: number): SyncStep => ({
      link: { ...LINK, counts: { ...LINK.counts, adding } },
      added,
      remaining,
      version: 9,
    })
    steps = [after(20, 5, 5), after(5, 0, 0)]
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('25 games came in from Steam.'),
    )
    const asked = sent.filter((each) => each.path.endsWith('/sync'))
    expect(asked.map((each) => each.body)).toEqual([{ read: true }, { read: false }])
  })

  it('asks before disconnecting, and says the games stay', async () => {
    platforms = rows(LINK)
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    const [card] = screen.getAllByRole('article')
    expect(within(card!).getByText(/Your games stay on your shelf, with their hours/)).toBeVisible()
    expect(sent.some((each) => each.method === 'DELETE')).toBe(false)
  })
})

describe('Nintendo', () => {
  const step = (counts: Partial<LinkView['counts']>, added = 0, remaining = 0): SyncStep => ({
    link: { ...NINTENDO, counts: { ...NINTENDO.counts, ...counts } },
    added,
    remaining,
    version: 9,
  })

  it('sends me to Nintendo’s page in a new tab, and asks for the link its button gives', async () => {
    platforms = rows(null)
    renderWithIntl(<Platforms handle="ana" />)
    const signIn = await screen.findByRole('link', { name: 'Sign in on Nintendo’s page' })
    expect(signIn).toHaveAttribute('href', '/api/v1/me/platforms/nintendo/connect?locale=en')
    expect(signIn).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/do not press it. Copy its link instead/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link Nintendo' })).toBeDisabled()
  })

  it('draws the button whose link to copy, hidden from assistive technology, as the words say it', async () => {
    platforms = rows(null)
    renderWithIntl(<Platforms handle="ana" />, 'pt-BR')
    const picked = await screen.findByText('Copiar endereço do link')
    const picture = picked.closest('[aria-hidden="true"]')
    expect(picture).not.toBeNull()
    expect(picture).toHaveTextContent('Selecionar esta conta')
    // Nothing in it to press: a drawing, not the button.
    expect(within(picture as HTMLElement).queryByRole('button', { hidden: true })).toBeNull()
    expect(screen.getByText(/Copie o link do botão/)).toBeVisible()
  })

  it('says what was wrong with a pasted link, and links nothing', async () => {
    platforms = rows(null)
    pasted = 'not-the-link'
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.type(
      await screen.findByLabelText('Paste the link here.'),
      'https://example.test',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Link Nintendo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not the link from Nintendo/)
    expect(sent.some((each) => each.path.endsWith('/nintendo/sync'))).toBe(false)
  })

  it('links with the pasted link, then reads Nintendo at once', async () => {
    platforms = rows(null)
    steps = [step({ 'needs-you': 9 })]
    renderWithIntl(<Platforms handle="ana" />)
    const link = 'npf5c38e31cd085304b://auth#session_token_code=a.b.c&state=s'
    await userEvent.type(await screen.findByLabelText('Paste the link here.'), link)
    await userEvent.click(screen.getByRole('button', { name: 'Link Nintendo' }))
    expect(await screen.findByText('Linked to Ana')).toBeInTheDocument()
    await waitFor(() =>
      expect(sent.find((each) => each.path.endsWith('/nintendo/sync'))?.body).toEqual({
        read: true,
      }),
    )
    expect(sent.find((each) => each.path.endsWith('/link'))?.body).toEqual({ link })
  })

  it('asks to sign in again when Nintendo has ended Shelf’s session', async () => {
    platforms = rows(null, { ...NINTENDO, problem: 'signed-out' })
    renderWithIntl(<Platforms handle="ana" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nintendo ended Shelf’s sign-in/)
    expect(screen.getByRole('link', { name: 'Sign in on Nintendo’s page' })).toBeInTheDocument()
  })

  it('shows each game Shelf matched, and asks whether it is a cartridge or a download', async () => {
    platforms = rows(null, NINTENDO)
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    expect(await screen.findByText('Shelf thinks it is Metroid Dread (2021)')).toBeInTheDocument()
    const [cartridge] = screen.getAllByRole('button', { name: 'Cartridge' })
    expect(cartridge).toHaveAccessibleDescription(/Mario Kart 8 Deluxe/)
    await userEvent.click(cartridge!)
    await waitFor(() =>
      expect(sent.find((each) => each.path.endsWith('/items/kart'))?.body).toEqual({
        kind: 'confirm',
        format: 'physical',
      }),
    )
    // The game Shelf could not match is found as Steam's are.
    expect(screen.getAllByRole('button', { name: 'Find it' })).toHaveLength(1)
  })

  it('pictures each answer beside its word, which alone names the button', async () => {
    platforms = rows(null, NINTENDO)
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    await screen.findByText('Shelf thinks it is Metroid Dread (2021)')
    const answers = [
      ...screen.getAllByRole('button', { name: 'Cartridge' }),
      ...screen.getAllByRole('button', { name: 'Download' }),
      screen.getByRole('button', { name: 'Cartridges' }),
      screen.getByRole('button', { name: 'Downloads' }),
    ]
    for (const answer of answers) {
      expect(answer.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('lists the games Shelf matched first, then those it could not find, under a heading of their own', async () => {
    platforms = rows(null, NINTENDO)
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    const heading = await screen.findByRole('heading', { name: 'Shelf could not find this game' })
    const after = (one: Node, other: Node) =>
      Boolean(one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)
    for (const cartridge of screen.getAllByRole('button', { name: 'Cartridge' })) {
      expect(after(cartridge, heading)).toBe(true)
    }
    expect(after(heading, screen.getByRole('button', { name: 'Find it' }))).toBe(true)
  })

  it('shows a game Nintendo lists twice as one, with both its hours, and answers for both', async () => {
    platforms = rows(null, NINTENDO)
    listed = [
      ...PLAYED,
      played('kart-2', 'Mario Kart 8 Deluxe – Nintendo Switch 2 Edition', PLAYED[0]!.match),
    ]
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    expect(
      await screen.findAllByText('Shelf thinks it is Mario Kart 8 Deluxe (2017)'),
    ).toHaveLength(1)
    expect(
      screen.getByText(
        'Nintendo also lists it as Mario Kart 8 Deluxe – Nintendo Switch 2 Edition.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('20 h on Nintendo')).toBeInTheDocument()
    expect(screen.getByText('All 2 games Shelf found are:')).toBeInTheDocument()
    const [cartridge] = screen.getAllByRole('button', { name: 'Cartridge' })
    await userEvent.click(cartridge!)
    await waitFor(() =>
      expect(
        sent.filter((each) => each.method === 'POST' && each.path.includes('/items/')),
      ).toEqual([
        expect.objectContaining({ path: expect.stringMatching(/\/items\/kart$/) }),
        expect.objectContaining({ path: expect.stringMatching(/\/items\/kart-2$/) }),
      ]),
    )
  })

  it('takes a game off the list the moment I answer, before Shelf has finished', async () => {
    platforms = rows(null, NINTENDO)
    let release = () => {}
    answerHeld = new Promise<void>((resolve) => (release = resolve))
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    await screen.findByText('Shelf thinks it is Mario Kart 8 Deluxe (2017)')
    const [cartridge] = screen.getAllByRole('button', { name: 'Cartridge' })
    await userEvent.click(cartridge!)
    expect(screen.queryByText('Shelf thinks it is Mario Kart 8 Deluxe (2017)')).toBeNull()
    expect(screen.getByText('Shelf thinks it is Metroid Dread (2021)')).toBeInTheDocument()
    release()
    // Answered, the list is fetched again; the game stays off it.
    await waitFor(() =>
      expect(sent.filter((each) => each.path.endsWith('/items?list=needs-you'))).toHaveLength(2),
    )
    expect(screen.queryByText('Shelf thinks it is Mario Kart 8 Deluxe (2017)')).toBeNull()
  })

  it('puts a game back on the list, saying so, when the answer fails', async () => {
    platforms = rows(null, NINTENDO)
    answerFails = true
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    const [cartridge] = await screen.findAllByRole('button', { name: 'Cartridge' })
    await userEvent.click(cartridge!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not work. Try again.')
    expect(screen.getByText('Shelf thinks it is Mario Kart 8 Deluxe (2017)')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Cartridge' })[0]).toBeEnabled()
  })

  it('says how many games wait for me, not that all is up to date', async () => {
    platforms = rows(null, NINTENDO)
    steps = [step({})]
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('3 games wait for your answer.'),
    )
  })

  it('says one format for every match at once, then puts them on the shelf in steps', async () => {
    platforms = rows(null, NINTENDO)
    steps = [step({ adding: 1 }, 1, 1), step({ 'on-shelf': 2, 'needs-you': 1 }, 1, 0)]
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByText('3 games need you'))
    expect(await screen.findByText('All 2 games Shelf found are:')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Downloads' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '2 games came in from Nintendo. 1 game waits for your answer.',
      ),
    )
    expect(sent.find((each) => each.path.endsWith('/answers'))?.body).toEqual({
      ids: ['kart', 'dread'],
      answer: { kind: 'confirm', format: 'digital' },
    })
  })
})
