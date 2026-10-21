import 'server-only'

import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { jwt, oAuthProxy } from 'better-auth/plugins'

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
  sessions,
  users,
  verifications,
} from '@/server/db/schema'
import { authEnv, deployment, mocksRequested, onVercel } from '@/server/env'
import { siteUrl } from '@/server/site-url'

/**
 * Sign-in (architecture, section 9): GitHub only, and one account only.
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

/** Why GitHub's answer was turned away: in the address the person is sent back to. */
export const NOT_THE_OWNER = 'not_the_owner'

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
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL

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
      },
    }),
    socialProviders: {
      github: { clientId: env.github.clientId, clientSecret: env.github.clientSecret },
    },
    user: {
      // The lock is `requireOwner`, on every write. This is the courtesy: anyone
      // else is turned away before an account is stored, with a plain message.
      // It runs on a first sign-in, on every sign-in after, and on a preview
      // signing in through production, with GitHub's own profile each time.
      validateUserInfo: ({ source }) => {
        const id = source.oauth?.providerId === 'github' ? source.oauth.profile?.id : undefined
        if (String(id) !== env.ownerGithubId) return { error: NOT_THE_OWNER }
      },
    },
    session: { expiresIn: WEEK, updateAge: 60 * 60 * 24 },
    // Sign-in attempts are limited per address. The browser tests all come
    // from this machine, signing in again and again, so with the test
    // doubles on (never on a deployment) the limit is lifted.
    rateLimit: { enabled: !mocksRequested() },
    advanced: { cookiePrefix: 'shelf' },
    telemetry: { enabled: false },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const hint = { path: '/', sameSite: 'lax' as const, secure: onVercel(), httpOnly: false }
        if (ctx.context.newSession) ctx.setCookie(OWNER_HINT_COOKIE, '1', { ...hint, maxAge: WEEK })
        if (ctx.path === '/sign-out') ctx.setCookie(OWNER_HINT_COOKIE, '', { ...hint, maxAge: 0 })
      }),
    },
    plugins: [
      // An assistant signs in as me for the owner's MCP endpoint: OAuth, with
      // me signing in through GitHub as on the site, then saying yes on the
      // consent page. Its access tokens are JWTs, signed here and checked by
      // the endpoint. Only I can sign in, so only I can say yes.
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
      // A preview has no GitHub app of its own: GitHub sends the person back to
      // production, which hands the answer on, sealed, to the preview it came
      // from. This machine has its own app, so it signs in directly.
      ...(deployment() === 'local' || !production
        ? []
        : [oAuthProxy({ productionURL: `https://${production}`, secret: env.proxySecret })]),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let shared: Auth | undefined

export const auth = (): Auth => (shared ??= createAuth())
