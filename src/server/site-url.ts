/**
 * The address this deployment answers on, without a trailing slash.
 * Vercel provides it; on this machine it is the local server.
 */
export function siteUrl(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (process.env.VERCEL_ENV === 'production' && production) return `https://${production}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? '3300'}`
}
