import type { Page } from '@playwright/test'

import { expect, fillSignIn, OWNER, signIn, test } from './fixtures'

/**
 * Signing in (spec 11, ADR 004): by email address or handle, and password.
 * Nothing here goes around sign-in: the form is sent to the same code a
 * real sign-in runs, as the sample account, with the test server's made-up
 * password. Making accounts is in `accounts.writes.spec.ts`.
 */

const footer = (page: Page) => page.locator('footer')
/** The page's own message: Next.js's route announcer is an alert too. */
const trouble = (page: Page) => page.getByRole('main').getByRole('alert')
const WRONG = 'That email address or handle and that password do not match. Try again.'

test.describe('signing in', () => {
  test('signs in and comes back to the page left @smoke', async ({ page, context }) => {
    await page.goto('/en/u/sample/trophies')
    await footer(page).getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\?from=%2Fen%2Fu%2Fsample%2Ftrophies$/)
    await page.locator('html[data-ready]').waitFor({ state: 'attached' })
    await fillSignIn(page, OWNER.email, OWNER.password)

    await expect(page).toHaveURL(/\/en\/u\/sample\/trophies$/)
    await expect(footer(page)).toContainText('Signed in as Sample')
    const cookies = await context.cookies()
    // The session is out of scripts' reach; only the hint is not.
    expect(cookies.find((cookie) => cookie.name === 'shelf.session_token')?.httpOnly).toBe(true)
    expect(cookies.find((cookie) => cookie.name === 'shelf_signed_in')?.httpOnly).toBe(false)
    expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({
      signedIn: true,
      handle: 'sample',
      name: 'Sample',
      shelfPublic: true,
    })
  })

  test('takes a handle in place of the email address, and goes on to one’s own shelf', async ({
    page,
  }) => {
    await page.goto('/en/sign-in')
    await page.locator('html[data-ready]').waitFor({ state: 'attached' })
    await fillSignIn(page, 'Sample', OWNER.password)
    await expect(page).toHaveURL(/\/en\/u\/sample$/)
    await expect(page.getByRole('button', { name: 'Sample, your account' })).toBeVisible()
  })

  test('the password can be shown as typed, and hidden again', async ({ page }) => {
    await page.goto('/en/sign-in')
    await page.locator('html[data-ready]').waitFor({ state: 'attached' })
    const password = page.getByLabel('Password', { exact: true })
    const show = page.getByRole('button', { name: 'Show the password' })
    await password.fill('a password typed')
    await expect(password).toHaveAttribute('type', 'password')

    await show.click()
    await expect(show).toHaveAttribute('aria-pressed', 'true')
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue('a password typed')

    await show.click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test.describe('turned away', () => {
    // A wrong password is answered 401, which the browser logs as a failed request.
    test.use({ allowConsoleErrors: true })

    test('a wrong password, or any other address, is turned away, and nothing is kept', async ({
      page,
      context,
    }) => {
      await page.goto('/en/sign-in')
      await page.locator('html[data-ready]').waitFor({ state: 'attached' })

      await fillSignIn(page, OWNER.email, 'not-the-sample-password')
      await expect(trouble(page)).toHaveText(WRONG)
      // The address stays; the password is typed again.
      await expect(page.getByLabel('Email address or handle')).toHaveValue(OWNER.email)
      const password = page.getByLabel('Password', { exact: true })
      await expect(password).toHaveValue('')
      await expect(password).toBeFocused()

      for (const who of ['someone@shelf.test', 'no-such-handle']) {
        await fillSignIn(page, who, OWNER.password)
        await expect(trouble(page)).toHaveText(WRONG)
      }
      await expect(page).toHaveURL(/\/en\/sign-in$/)
      expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
        'shelf.session_token',
      )
      expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ signedIn: false })
    })
  })

  test('offers a shelf of one’s own to someone without one', async ({ page }) => {
    await page.goto('/en/sign-in')
    await page.getByRole('main').getByRole('link', { name: 'Create one' }).click()
    await expect(page).toHaveURL(/\/en\/sign-up$/)
  })

  test('an assistant’s request carries on to the consent page once signed in', async ({
    page,
    browserName,
    size,
  }) => {
    test.skip(
      browserName !== 'chromium' || size !== 'desktop',
      'once is enough: no browser differs',
    )
    // The test doubles' assistant (MOCK_ASSISTANT), asking as an assistant does.
    const address = new URL('/api/auth/oauth2/authorize', 'http://localhost:3300')
    address.search = new URLSearchParams({
      response_type: 'code',
      client_id: 'https://assistant.example/shelf-tests/client.json',
      redirect_uri: 'http://127.0.0.1:47231/callback',
      scope: 'openid offline_access',
      state: 'from-the-test',
      // RFC 7636's own example; nothing here trades the code for a token.
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      resource: 'http://localhost:3300/api/mcp/owner',
      // Asked every time, so a yes from an earlier run is not taken as given.
      prompt: 'consent',
    }).toString()
    await page.goto(address.toString())
    await expect(page).toHaveURL(/\/en\/sign-in\?.*sig=/)
    await expect(page.getByText('An assistant asks to use your library as you.')).toBeVisible()
    await fillSignIn(page, OWNER.email, OWNER.password)
    await expect(page).toHaveURL(/\/en\/consent\?/)
    await expect(page.getByRole('main')).toContainText(
      'Test Assistant asks to use your library as you.',
    )
  })

  test('a visitor is offered no way to add a game, and A does nothing', async ({ page }) => {
    await page.goto('/en/u/sample')
    await expect(footer(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
    await page.keyboard.press('a')
    await expect(page.getByRole('dialog', { name: 'Add a game' })).toHaveCount(0)
  })

  test('a visitor never asks who they are', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/me')) asked.push(request.url())
    })
    await page.goto('/en/u/sample')
    await expect(footer(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
    expect(asked).toEqual([])
  })
})

test.describe('signed in', () => {
  test.use({ signedIn: true })

  test('signing out ends the session, and the page is a visitor’s again', async ({
    page,
    context,
  }) => {
    // A session of this test's own: signing out the shared one would sign out the others.
    await context.clearCookies()
    await signIn(page, '/en/u/sample')
    await expect(page.getByRole('button', { name: 'Save as a shelf' })).toBeVisible()

    await footer(page).getByRole('button', { name: 'Sign out' }).click()
    await expect(footer(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save as a shelf' })).toHaveCount(0)
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
      'shelf.session_token',
    )
    expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ signedIn: false })
  })

  test('the account menu leads to one’s own shelf and account, and signs out', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await signIn(page, '/en/u/sample/trophies')
    const menu = async () => {
      await page.getByRole('button', { name: 'Sample, your account' }).click()
      return page.getByRole('menu')
    }
    await (await menu()).getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL(/\/en\/account$/)
    await expect(page.getByRole('heading', { name: 'Your shelf' })).toBeVisible()
    await (await menu()).getByRole('menuitem', { name: 'My shelf' }).click()
    await expect(page).toHaveURL(/\/en\/u\/sample$/)
    await (await menu()).getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('the sign-in page says who is signed in, and offers the way out', async ({ page }) => {
    await page.goto('/en/sign-in')
    await expect(page.getByText('Signed in as Sample.')).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
