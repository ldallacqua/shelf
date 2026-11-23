/**
 * The hosts production answers on (setup, session G): its own domain, the
 * `www` that leads there, and the address it had before, which still serves
 * it. A script that signs in with the test doubles' made-up password refuses
 * them all.
 */
export const PRODUCTION_HOSTS: readonly string[] = [
  'savestate.gg',
  'www.savestate.gg',
  'shelf-ldallacqua.vercel.app',
]

/** Whether `address` is production's, by its host alone: any scheme, port or case. */
export function isProduction(address: string): boolean {
  let host: string
  try {
    host = new URL(address).hostname
  } catch {
    return false
  }
  // `savestate.gg.` is the same host, written fully qualified.
  return PRODUCTION_HOSTS.includes(host.replace(/\.$/, ''))
}
