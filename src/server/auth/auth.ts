import 'server-only'

import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'

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
import { authEnv, mocksRequested, onVercel, OWNER_PASSWORD_MIN } from '@/server/env'
import { siteUrl } from '@/server/site-url'

/**
 * Sign-in (architecture, section 9): one account, by email address and
 * password, made from the settings. Nobody can make another.
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
export const OWNER_HINT_COOKIE = 'shelf_owner_hint'

/** Where the password is checked. */
const SIGN_IN = '/sign-in/email'

/**
 * The one account, made from the settings the first time anyone signs in,
 * and kept in step with them: a changed password is hashed again, and every
 * session signed in with the old one ends. Once per server; a changed
 * setting arrives with a new deployment, and so a new server.
 */
let ownerReady: Promise<void> | undefined

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
    // No way to make an account: the one there is comes from the settings.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: OWNER_PASSWORD_MIN,
    },
    session: { expiresIn: WEEK, updateAge: 60 * 60 * 24 },
    // Five tries a minute from one address, counted in the database, where
    // every server sees the same count. The browser tests all come from this
    // machine, signing in again and again, so with the test doubles on
    // (never on a deployment) the limit is lifted.
    rateLimit: {
      enabled: !mocksRequested(),
      storage: 'database',
      customRules: { [SIGN_IN]: { window: 60, max: 5 } },
    },
    advanced: { cookiePrefix: 'shelf' },
    telemetry: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN) return
        const { internalAdapter: store, password } = ctx.context
        const { email } = env.owner
        ownerReady ??= (async () => {
          const found = await store.findUserByEmail(email)
          const user =
            found?.user ??
            (await store.createUser(
              { email, name: email, emailVerified: true },
              { method: 'admin' },
            ))
          const credential = (await store.findAccounts(user.id)).find(
            (account) => account.providerId === 'credential',
          )
          if (
            credential?.password &&
            (await password.verify({ hash: credential.password, password: env.owner.password }))
          ) {
            return
          }
          const hash = await password.hash(env.owner.password)
          if (credential) await store.updatePassword(user.id, hash)
          else {
            await store.linkAccount({
              userId: user.id,
              providerId: 'credential',
              accountId: user.id,
              password: hash,
            })
          }
          // A new password: whoever signed in with the old one is signed out.
          await store.deleteUserSessions(user.id)
        })().catch((error: unknown) => {
          ownerReady = undefined
          throw error
        })
        await ownerReady
      }),
      after: createAuthMiddleware(async (ctx) => {
        const hint = { path: '/', sameSite: 'lax' as const, secure: onVercel(), httpOnly: false }
        if (ctx.context.newSession) ctx.setCookie(OWNER_HINT_COOKIE, '1', { ...hint, maxAge: WEEK })
        if (ctx.path === '/sign-out') ctx.setCookie(OWNER_HINT_COOKIE, '', { ...hint, maxAge: 0 })
      }),
    },
    plugins: [
      // An assistant signs in as me for the owner's MCP endpoint: OAuth, with
      // me signing in as on the site, then saying yes on the consent page.
      // Its access tokens are JWTs, signed here and checked by the endpoint.
      // Only I can sign in, so only I can say yes.
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
