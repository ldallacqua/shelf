import 'server-only'

import { deployment, onVercel } from '@/server/env'

/**
 * Where production answered before it had a domain of its own, and still
 * answers (setup, session G). Vercel names one production address, the
 * shortest custom domain (`VERCEL_PROJECT_PRODUCTION_URL`), but keeps serving
 * production here, where links and bookmarks lead, people are signed in, and
 * Shelf for Windows from before the domain opens. Better Auth refuses a host
 * it was not given, so without this list signing in here would fail. It can
 * go once this address redirects to the domain.
 */
export const FORMER_PRODUCTION_HOSTS: readonly string[] = ['shelf-ldallacqua.vercel.app']

/** The addresses this deployment answers on, which sign-in may send people back to. */
export const ownHosts = (): string[] => {
  const hosts = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    ...(deployment() === 'production' ? FORMER_PRODUCTION_HOSTS : []),
  ].filter((host): host is string => Boolean(host?.trim()))
  const unique = [...new Set(hosts)]
  return onVercel() ? unique : [...unique, `localhost:${process.env.PORT ?? '3300'}`]
}
