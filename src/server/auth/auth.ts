import 'server-only'

import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { jwt, username } from 'better-auth/plugins'
import { revalidateTag } from 'next/cache'

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from '@/domain/accounts/account'
import { HANDLE_MAX, HANDLE_MIN, isHandle } from '@/domain/accounts/handle'
import { database } from '@/server/db/client'
import {
  accounts,
  jwks,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  rateLimits,
  sessions,
  users,
  verifications,
} from '@/server/db/schema'
import { authEnv, mocksRequested, onVercel } from '@/server/env'
import { removeLibrary, startLibrary } from '@/server/library/store'
import { MOCK_OWNER } from '@/server/mocks/owner'
import { DIRECTORY_TAG, handleTag, libraryTag, shelvesTag } from '@/server/services/tags'
import { siteUrl } from '@/server/site-url'

/**
 * Accounts and sign-in (architecture, section 9; ADR 004): anyone signs up
 * with a name, a handle, an email address and a password, and gets a
 * library of their own. No email is sent: there is no confirming the
 * address and no resetting a password by email yet.
 *
 * Built on first use, not when the module loads, so a page that never signs
 * anyone in never needs the settings, and a preview without them still
 * serves every page.
 */

/** Seven days, extended when used. */
const WEEK = 60 * 60 * 24 * 7

/**
 * Tells the page that asking who is signed in is worth a request. It is not
 * the session (that cookie cannot be read by scripts) and proves nothing: a
 * visitor without it never asks, so a visitor costs no session lookup.
 */
export const SIGNED_IN_HINT_COOKIE = 'shelf_signed_in'

/** Where the password is checked: by email address, or by handle. */
const SIGN_IN = ['/sign-in/email', '/sign-in/username']
const SIGN_UP = '/sign-up/email'
/** Where it is checked again, signed in: the account page's password and delete. */
const PASSWORD_AGAIN = ['/change-password', '/delete-user']
/** After these, this browser is signed out. */
const SIGNED_OUT = ['/sign-out', '/revoke-sessions', '/delete-user']

/**
 * With the test doubles on, the sample account takes the made-up password
 * the browser tests sign in with, the first time anyone signs in. Never on
 * a deployment: the doubles refuse to start there.
 */
let sampleReady: Promise<void> | undefined

/** The owner's MCP endpoint, which assistants sign in to as me (architecture, section 16). */
export const MCP_OWNER_PATH = '/api/mcp/owner'

/**
 * What an assistant's access token is for, and who issued it: this
 * deployment's own address. On a preview, that is the deployment's address,
 * not its branch's.
 */
export const mcpResource = (): string => `${siteUrl()}${MCP_OWNER_PATH}`
export const authIssuer = (): string => `${siteUrl()}/api/auth`

/** The addresses this deployment answers on, which sign-in may send people back to. */
const ownHosts = (): string[] => {
  const hosts = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ].filter((host): host is string => Boolean(host?.trim()))
  return onVercel() ? hosts : [...hosts, `localhost:${process.env.PORT ?? '3300'}`]
}

const createAuth = () => {
  const env = authEnv()

  return betterAuth({
    appName: 'Shelf',
    secret: env.secret,
    baseURL: { allowedHosts: ownHosts(), protocol: onVercel() ? 'https' : 'http' },
    database: drizzleAdapter(database(), {
      provider: 'sqlite',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        jwks,
        oauthClient: oauthClients,
        oauthResource: oauthResources,
        oauthClientResource: oauthClientResources,
        oauthRefreshToken: oauthRefreshTokens,
        oauthAccessToken: oauthAccessTokens,
        oauthConsent: oauthConsents,
        oauthClientAssertion: oauthClientAssertions,
        rateLimit: rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
    },
    user: {
      additionalFields: {
        // Chosen at sign-up, Public picked for you (ADR 004); changed on the account page.
        shelfPublic: { type: 'boolean', required: false, defaultValue: true, input: true },
      },
      // The account and everything in its library. Asked for with the password.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await removeLibrary(database(), user.id)
          const handle = (user as { username?: string | null }).username
          for (const tag of [
            libraryTag(user.id),
            shelvesTag(user.id),
            DIRECTORY_TAG,
            ...(handle ? [handleTag(handle)] : []),
          ]) {
            revalidateTag(tag, { expire: 0 })
          }
        },
      },
    },
    // A new account's library: its version and key, and the starter shelves.
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await startLibrary(database(), user.id)
            // A new public shelf, for the sitemap.
            revalidateTag(DIRECTORY_TAG, { expire: 0 })
          },
        },
      },
    },
    session: { expiresIn: WEEK, updateAge: 60 * 60 * 24 },
    // Counted in the database, where every server sees the same count: five
    // tries at a password a minute from one address, and three new accounts
    // an hour. The browser tests all come from this machine, signing in and up
    // again and again, so with the test doubles on (never on a deployment)
    // the limits are lifted.
    rateLimit: {
      enabled: !mocksRequested(),
      storage: 'database',
      customRules: {
        ...Object.fromEntries(
          [...SIGN_IN, ...PASSWORD_AGAIN].map((path) => [path, { window: 60, max: 5 }]),
        ),
        [SIGN_UP]: { window: 60 * 60, max: 3 },
      },
    },
    advanced: { cookiePrefix: 'shelf' },
    telemetry: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === SIGN_UP) {
          // A handle is the shelf's address: sign-up takes none without one.
          const body = (ctx.body ?? {}) as { username?: unknown; name?: unknown }
          if (typeof body.username !== 'string' || body.username.length === 0) {
            throw new APIError('BAD_REQUEST', { message: 'A handle is needed.' })
          }
          if (typeof body.name !== 'string' || body.name.trim().length > NAME_MAX) {
            throw new APIError('BAD_REQUEST', { message: 'That name is too long.' })
          }
          return
        }
        if (!SIGN_IN.includes(ctx.path) || !mocksRequested()) return
        const { internalAdapter: store, password } = ctx.context
        sampleReady ??= (async () => {
          const found = await store.findUserByEmail(MOCK_OWNER.email)
          // No sample account yet: the database was never seeded. Nothing to give a password.
          if (!found) return
          const credential = (await store.findAccounts(found.user.id)).find(
            (account) => account.providerId === 'credential',
          )
          if (credential?.password) return
          await store.linkAccount({
            userId: found.user.id,
            providerId: 'credential',
            accountId: found.user.id,
            password: await password.hash(MOCK_OWNER.password),
          })
        })().catch((error: unknown) => {
          sampleReady = undefined
          throw error
        })
        await sampleReady
      }),
      after: createAuthMiddleware(async (ctx) => {
        const hint = { path: '/', sameSite: 'lax' as const, secure: onVercel(), httpOnly: false }
        if (ctx.context.newSession) {
          ctx.setCookie(SIGNED_IN_HINT_COOKIE, '1', { ...hint, maxAge: WEEK })
        }
        if (SIGNED_OUT.includes(ctx.path)) {
          ctx.setCookie(SIGNED_IN_HINT_COOKIE, '', { ...hint, maxAge: 0 })
        }
      }),
    },
    plugins: [
      // The handle in a shelf's address, lowercase, and a way to sign in with it.
      username({
        minUsernameLength: HANDLE_MIN,
        maxUsernameLength: HANDLE_MAX,
        usernameValidator: isHandle,
        validationOrder: { username: 'post-normalization' },
        displayUsername: false,
      }),
      // An assistant signs in as you for your MCP endpoint: OAuth, with you
      // signing in as on the site, then saying yes on the consent page. Its
      // access tokens are JWTs, signed here and checked by the endpoint, and
      // name your account: an assistant works on your library only.
      jwt({ jwt: { issuer: authIssuer() } }),
      mcp({ loginPage: '/en/sign-in', consentPage: '/en/consent', resource: mcpResource() }),
      // An assistant is known by the address of its Client ID Metadata
      // Document, fetched with the library's own pinned, redirect-refusing
      // transport. With the test doubles on, the document is the doubles'.
      cimd({
        fetchClientMetadataResource: mocksRequested()
          ? (input, init) => fetch(input, init)
          : fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let shared: Auth | undefined

export const auth = (): Auth => (shared ??= createAuth())
