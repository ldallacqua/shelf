import { randomBytes } from 'node:crypto'

import type { APIRequestContext, Browser, Page } from '@playwright/test'

import { expect, fillUntil, isSnapshot, OWNER, test } from './fixtures'

/**
 * Accounts (ADR 004): anyone makes a shelf of their own, public or private,
 * and changes or deletes it. Each test makes accounts of its own, with
 * handles no other run or project can have, through the real sign-up.
 */

/** A handle, an email address and a password made up for one test. */
const newcomer = (name = 'Newcomer') => {
  const handle = `e2e-${randomBytes(5).toString('hex')}`
  return { name, handle, email: `${handle}@shelf.test`, password: `made up for ${handle}` }
}
type Newcomer = ReturnType<typeof newcomer>

/** Makes the account through the same endpoint the sign-up page sends to; the request is then signed in as it. */
async function signUpThroughApi(request: APIRequestContext, who: Newcomer, shelfPublic = true) {
  const made = await request.post('/api/auth/sign-up/email', {
    data: {
      name: who.name,
      username: who.handle,
      email: who.email,
      password: who.password,
      shelfPublic,
      rememberMe: true,
    },
  })
  expect(made.status(), await made.text()).toBe(200)
}

type Search = { results: { igdbId: number; title: string; platforms: number[] }[] }

/** Adds a game to the signed-in account's own shelf. Returns its address. */
async function addThroughApi(request: APIRequestContext, title: string): Promise<string> {
  const search = (await (
    await request.get(`/api/v1/igdb/search?q=${encodeURIComponent(title)}`)
  ).json()) as Search
  const found = search.results.find((result) => result.title === title)
  if (!found) throw new Error(`IGDB's test double has no ${title}`)
  const added = await request.post('/api/v1/entries', {
    data: {
      igdbId: found.igdbId,
      status: 'playing',
      copies: [{ platform: found.platforms[0], format: 'digital' }],
    },
  })
  expect(added.status()).toBe(201)
  return ((await added.json()) as { slug: string }).slug
}

/**
 * A browser of someone else, signed in as no one. Its shelf is in 2D, as
 * every test's is unless it asks for 3D: in 3D a box has a second button.
 */
async function visitorPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  await context.addInitScript(() => window.localStorage.setItem('shelf:dimension', '2d'))
  return context.newPage()
}

const accountPage = async (page: Page) => {
  await page.goto('/en/account')
  await page.getByRole('heading', { name: 'Your shelf' }).waitFor()
}

test.describe('signing up', () => {
  test('makes a public shelf of one’s own, empty and ready to add to @smoke', async ({ page }) => {
    const who = newcomer('Ana Lima')
    await page.goto('/en/sign-up')
    // The handle follows the name until one is typed.
    await fillUntil(
      page.getByRole('textbox', { name: 'Your name' }),
      who.name,
      page.getByText('Free to take.'),
    )
    await expect(page.getByRole('textbox', { name: 'Handle' })).toHaveValue('ana-lima')
    await page.getByRole('textbox', { name: 'Handle' }).fill(who.handle)
    await expect(page.getByText('Free to take.')).toBeVisible()
    await page.getByRole('textbox', { name: 'Email address' }).fill(who.email)
    await page.getByLabel('Password', { exact: true }).fill(who.password)
    await expect(page.getByRole('radio', { name: /^Public/ })).toBeChecked()
    await page.getByRole('button', { name: 'Create my shelf' }).click()

    await expect(page).toHaveURL(new RegExp(`/en/u/${who.handle}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Ana Lima's shelf")
    await expect(page.getByText('Your shelf is empty.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add your first game' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ana Lima, your account' })).toBeVisible()
    expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({
      signedIn: true,
      handle: who.handle,
      shelfPublic: true,
    })

    // It is public: anyone can open it, and its smart shelves are the starter ones.
    const visitor = await visitorPage(page.context().browser()!)
    const response = await visitor.goto(`/en/u/${who.handle}`)
    expect(response?.status()).toBe(200)
    await expect(visitor.getByText('The shelf is being stocked.')).toBeVisible()
    await expect(visitor.getByRole('button', { name: 'Add your first game' })).toHaveCount(0)
    const shelves = (await (
      await visitor.request.get(`/api/v1/u/${who.handle}/shelves`)
    ).json()) as { shelves: { slug: string }[] }
    expect(shelves.shelves.map((shelf) => shelf.slug)).toContain('short-ones')
    await visitor.context().close()
  })

  test('says a handle is taken, or cannot be, as it is typed', async ({ page }) => {
    await page.goto('/en/sign-up')
    const handle = page.getByRole('textbox', { name: 'Handle' })
    await fillUntil(handle, 'sample', page.getByText('Another shelf has that one. Try another.'))
    await handle.fill('sign-up')
    await expect(page.getByText('That one is kept for the site. Try another.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create my shelf' })).toBeDisabled()
  })

  test.describe('refused', () => {
    // A refusal is answered 4xx, which the browser logs as a failed request.
    test.use({ allowConsoleErrors: true })

    test('an email address another account has is refused, and nothing is made', async ({
      page,
    }) => {
      const who = newcomer()
      await page.goto('/en/sign-up')
      await fillUntil(
        page.getByRole('textbox', { name: 'Handle' }),
        who.handle,
        page.getByText('Free to take.'),
      )
      await page.getByRole('textbox', { name: 'Your name' }).fill(who.name)
      await page.getByRole('textbox', { name: 'Email address' }).fill(OWNER.email)
      await page.getByLabel('Password', { exact: true }).fill(who.password)
      await expect(page.getByText('Free to take.')).toBeVisible()
      await page.getByRole('button', { name: 'Create my shelf' }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'An account already uses that email address. Sign in instead.',
      )
      // No account was made: the handle is still free.
      expect(await (await page.request.get(`/api/v1/handles/${who.handle}`)).json()).toEqual({
        available: true,
      })
    })

    test('the server checks the handle too, whatever the page says', async ({ request }) => {
      for (const username of ['sample', 'library', 'Not A Handle', '']) {
        const who = newcomer()
        const made = await request.post('/api/auth/sign-up/email', {
          data: { name: who.name, username, email: who.email, password: who.password },
        })
        expect(made.ok(), username).toBe(false)
      }
    })
  })
})

test.describe('a private shelf', () => {
  test('shows its games to its own account alone, in no page source, file or answer', async ({
    page,
    browser,
  }) => {
    const who = newcomer('Bea')
    await signUpThroughApi(page.request, who, false)
    const title = 'Half-Life'
    const slug = await addThroughApi(page.request, title)

    // Its own account sees it, drawn in the browser, and is told only it can.
    await page.goto(`/en/u/${who.handle}`)
    await expect(page.getByText('Only you can see this shelf.')).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible()
    await page.goto(`/en/u/${who.handle}/game/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    const own = await page.request.get('/api/v1/me/library')
    expect(own.headers()['cache-control']).toBe('private, no-store')
    expect(await own.text()).toContain(title)

    // Anyone else: that it is private, and nothing else.
    const visitor = await visitorPage(browser)
    const snapshots: string[] = []
    visitor.on('request', (request) => {
      if (isSnapshot(request.url())) snapshots.push(request.url())
    })
    for (const address of [`/en/u/${who.handle}`, `/en/u/${who.handle}/game/${slug}`]) {
      await visitor.goto(address)
      await expect(visitor.getByText('This shelf is private.')).toBeVisible()
      expect(await (await visitor.request.get(address)).text(), address).not.toContain(title)
    }
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    expect(snapshots).toEqual([])
    for (const path of ['library', 'facets', 'shelves', `games/${slug}`]) {
      const answer = await visitor.request.get(`/api/v1/u/${who.handle}/${path}`)
      expect(answer.status(), path).toBe(404)
    }
    expect((await visitor.request.get('/api/v1/me/library')).status()).toBe(401)
    await visitor.context().close()
  })

  test('going private takes the shelf from visitors, and its old files with it', async ({
    page,
    browser,
  }) => {
    const who = newcomer('Caio')
    await signUpThroughApi(page.request, who)
    await addThroughApi(page.request, 'Mass Effect')

    const visitor = await visitorPage(browser)
    const file = visitor.waitForResponse((response) => isSnapshot(response.url()))
    await visitor.goto(`/en/u/${who.handle}`)
    const before = (await file).url()
    await expect(visitor.getByRole('button', { name: /^Mass Effect/ })).toBeVisible()

    await accountPage(page)
    await page.getByRole('radio', { name: /^Private/ }).check()
    await expect(page.getByText(/Going private hides your shelf from now on/)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

    await visitor.goto(`/en/u/${who.handle}`)
    await expect(visitor.getByText('This shelf is private.')).toBeVisible()
    // The file a visitor had is at an address that now leads nowhere.
    expect((await visitor.request.get(before)).status()).toBe(404)

    // And back: public again, at a new address of its own.
    await accountPage(page)
    await page.getByRole('radio', { name: /^Public/ }).check()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await visitor.goto(`/en/u/${who.handle}`)
    await expect(visitor.getByRole('button', { name: /^Mass Effect/ })).toBeVisible()
    await visitor.context().close()
  })
})

test.describe('one’s account', () => {
  test('a new handle moves the shelf, and the old address leads nowhere', async ({ page }) => {
    const who = newcomer('Dani')
    await signUpThroughApi(page.request, who)
    const moved = `${who.handle}-new`

    await accountPage(page)
    await page.getByRole('textbox', { name: 'Handle' }).fill(moved)
    await expect(page.getByText(/A new handle moves your shelf to a new address/)).toBeVisible()
    await expect(page.getByText('Free to take.')).toBeVisible()
    await page.getByRole('textbox', { name: 'Name' }).fill('Dani R.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dani R., your account' })).toBeVisible()

    await page.goto(`/en/u/${moved}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Dani R.'s shelf")
    await page.goto(`/en/u/${who.handle}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No shelf here')
  })

  test('a new password replaces the old one', async ({ page, browser }) => {
    const who = newcomer()
    await signUpThroughApi(page.request, who)
    const next = `${who.password}, changed`

    await accountPage(page)
    await page.getByLabel('Current password', { exact: true }).fill(who.password)
    await page.getByLabel('New password', { exact: true }).fill(next)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(
      page.getByText('Password changed. Every other device was signed out.'),
    ).toBeVisible()

    const elsewhere = await visitorPage(browser)
    const signIn = (password: string) =>
      elsewhere.request.post('/api/auth/sign-in/username', {
        data: { username: who.handle, password },
      })
    expect((await signIn(who.password)).status()).toBe(401)
    expect((await signIn(next)).ok()).toBe(true)
    await elsewhere.context().close()
  })

  test.describe('deleted', () => {
    // The password typed wrong first is answered 400.
    test.use({ allowConsoleErrors: true })

    test('takes everything with it, after the password', async ({ page, browser }) => {
      const who = newcomer('Eli')
      await signUpThroughApi(page.request, who)
      const slug = await addThroughApi(page.request, 'Max Payne')

      await accountPage(page)
      await page.getByRole('button', { name: 'Delete my account…' }).click()
      await page.getByLabel('Your password, to confirm', { exact: true }).fill('not the password')
      await page.getByRole('button', { name: 'Delete everything for good' }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'That is not your password.',
      )
      await page.getByLabel('Your password, to confirm', { exact: true }).fill(who.password)
      await page.getByRole('button', { name: 'Delete everything for good' }).click()
      await expect(page).toHaveURL(/\/en$/)

      const visitor = await visitorPage(browser)
      await visitor.goto(`/en/u/${who.handle}`)
      await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('No shelf here')
      expect((await visitor.request.get(`/api/v1/u/${who.handle}/games/${slug}`)).status()).toBe(
        404,
      )
      // Its handle is free again, and its password opens nothing.
      expect(await (await visitor.request.get(`/api/v1/handles/${who.handle}`)).json()).toEqual({
        available: true,
      })
      const signIn = await visitor.request.post('/api/auth/sign-in/email', {
        data: { email: who.email, password: who.password },
      })
      expect(signIn.status()).toBe(401)
      await visitor.context().close()
    })
  })
})

test.describe('another account', () => {
  // Refusals are answered 404, which the browser logs.
  test.use({ allowConsoleErrors: true })

  test('can change nothing on a shelf that is not its own', async ({ page }) => {
    const who = newcomer('Fran')
    await signUpThroughApi(page.request, who)

    await page.goto('/en/u/sample/game/bloodborne')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bloodborne')
    await expect(page.getByRole('group', { name: 'Status' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove from library' })).toHaveCount(0)
    await page.goto('/en/u/sample')
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save as a shelf' })).toHaveCount(0)

    // A write names no library: it acts on one's own, where the sample's game is not.
    const before = await (await page.request.get('/api/v1/u/sample/games/bloodborne')).json()
    for (const [method, data] of [
      ['PATCH', { status: 'dropped' }],
      ['DELETE', undefined],
    ] as const) {
      const answer = await page.request.fetch('/api/v1/entries/bloodborne', {
        method,
        ...(data ? { data } : {}),
      })
      expect(answer.status(), method).toBe(404)
    }
    expect(await (await page.request.get('/api/v1/u/sample/games/bloodborne')).json()).toEqual(
      before,
    )

    // A smart shelf of the same name is one's own: removing it leaves the sample's.
    expect((await page.request.delete('/api/v1/shelves/short-ones')).ok()).toBe(true)
    expect((await page.request.get(`/api/v1/u/${who.handle}/shelves/short-ones`)).status()).toBe(
      404,
    )
    expect((await page.request.get('/api/v1/u/sample/shelves/short-ones')).status()).toBe(200)
  })
})
