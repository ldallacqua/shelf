import type { Page } from '@playwright/test'

import { expect, signIn, test } from './fixtures'

/**
 * Signing in (spec 11): GitHub only, one account only. Nothing here goes
 * around sign-in: the browser's trip to GitHub comes straight back with a
 * code, and the server asks GitHub's test doubles who that is, through the
 * same code a real sign-in runs.
 */

const footer = (page: Page) => page.locator('footer')

test.describe('signing in', () => {
  test('the owner signs in with GitHub and comes back to the page they left @smoke', async ({
    page,
    context,
  }) => {
    await page.goto('/en/trophies')
    await footer(page).getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\?from=%2Fen%2Ftrophies$/)
    await signIn(page, 'owner', '/en/trophies')

    await expect(page).toHaveURL(/\/en\/trophies$/)
    await expect(footer(page)).toContainText('Signed in as Shelf Owner')
    const cookies = await context.cookies()
    // The session is out of scripts' reach; only the hint is not.
    expect(cookies.find((cookie) => cookie.name === 'shelf.session_token')?.httpOnly).toBe(true)
    expect(cookies.find((cookie) => cookie.name === 'shelf_owner_hint')?.httpOnly).toBe(false)
    expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({ owner: true })
  })

  test('any other GitHub account is turned away with a plain message, and nothing is kept', async ({
    page,
    context,
  }) => {
    await signIn(page, 'stranger')
    await expect(page).toHaveURL(/\/en\/sign-in\?error=not_the_owner/)
    await expect(page.getByText('That GitHub account is not the owner of this shelf')).toBeVisible()
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
      'shelf.session_token',
    )
    expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ owner: false })
    await expect(footer(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
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
    await signIn(page, 'owner', '/en/library')
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
    await expect(page.getByText('Signed in as Shelf Owner.')).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
