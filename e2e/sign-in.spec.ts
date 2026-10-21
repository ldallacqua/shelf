import type { Page } from '@playwright/test'

import { expect, fillSignIn, OWNER, signIn, test } from './fixtures'

/**
 * Signing in (spec 11): one account, by email address and password, made
 * from the server's settings. Nothing here goes around sign-in: the form is
 * sent to the same code a real sign-in runs, with the test server's made-up
 * owner.
 */

const footer = (page: Page) => page.locator('footer')
/** The page's own message: Next.js's route announcer is an alert too. */
const trouble = (page: Page) => page.getByRole('main').getByRole('alert')

test.describe('signing in', () => {
  test('the owner signs in and comes back to the page they left @smoke', async ({
    page,
    context,
  }) => {
    await page.goto('/en/trophies')
    await footer(page).getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\?from=%2Fen%2Ftrophies$/)
    await page.locator('html[data-ready]').waitFor({ state: 'attached' })
    await fillSignIn(page, OWNER.email, OWNER.password)

    await expect(page).toHaveURL(/\/en\/trophies$/)
    await expect(footer(page)).toContainText(`Signed in as ${OWNER.email}`)
    const cookies = await context.cookies()
    // The session is out of scripts' reach; only the hint is not.
    expect(cookies.find((cookie) => cookie.name === 'shelf.session_token')?.httpOnly).toBe(true)
    expect(cookies.find((cookie) => cookie.name === 'shelf_owner_hint')?.httpOnly).toBe(false)
    expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({ owner: true })
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
      const wrong = 'That email address and password do not match. Try again.'

      await fillSignIn(page, OWNER.email, 'not-the-owner-password')
      await expect(trouble(page)).toHaveText(wrong)
      // The address stays; the password is typed again.
      await expect(page.getByLabel('Email address')).toHaveValue(OWNER.email)
      const password = page.getByLabel('Password', { exact: true })
      await expect(password).toHaveValue('')
      await expect(password).toBeFocused()

      await fillSignIn(page, 'someone@shelf.test', OWNER.password)
      await expect(trouble(page)).toHaveText(wrong)
      await expect(page).toHaveURL(/\/en\/sign-in$/)
      expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
        'shelf.session_token',
      )
      expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ owner: false })
    })

    test('nobody can make an account', async ({ page, context }) => {
      const made = await page.request.post('/api/auth/sign-up/email', {
        data: { email: 'someone@shelf.test', password: 'a-long-enough-password', name: 'Someone' },
      })
      expect(made.ok()).toBe(false)
      expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
        'shelf.session_token',
      )
      // Nor can that address sign in afterwards.
      await page.goto('/en/sign-in')
      await page.locator('html[data-ready]').waitFor({ state: 'attached' })
      await fillSignIn(page, 'someone@shelf.test', 'a-long-enough-password')
      await expect(trouble(page)).toHaveText(
        'That email address and password do not match. Try again.',
      )
    })
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
    await page.goto('/en/library')
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
    await page.goto('/en/library')
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
    await signIn(page, '/en/library')
    await expect(page.getByRole('button', { name: 'Save as a shelf' })).toBeVisible()

    await footer(page).getByRole('button', { name: 'Sign out' }).click()
    await expect(footer(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save as a shelf' })).toHaveCount(0)
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
      'shelf.session_token',
    )
    expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ owner: false })
  })

  test('the sign-in page says who is signed in, and offers the way out', async ({ page }) => {
    await page.goto('/en/sign-in')
    await expect(page.getByText(`Signed in as ${OWNER.email}.`)).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
