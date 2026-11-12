/**
 * Where Shelf for Windows is downloaded from (ADR 005, section 9): releases of this repository,
 * each with its installer and `latest.json`, the file the installed app reads its updates from.
 * A download button leads to `DOWNLOAD_WINDOWS`, which answers with the newest installer, so a
 * page built ahead never names a version that a later release has replaced.
 */

export const REPOSITORY = 'ldallacqua/shelf'

/** The address a download button links to: this site's, which sends the browser on. */
export const DOWNLOAD_WINDOWS = '/api/desktop/windows'

/** The newest release's description of itself, as the installed app's updater reads it. */
export const LATEST_RELEASE = `https://github.com/${REPOSITORY}/releases/latest/download/latest.json`

/** Every release, with its notes: where a download goes when the newest can't be read. */
export const RELEASES_PAGE = `https://github.com/${REPOSITORY}/releases`

const INSTALLER = new RegExp(
  `^https://github\\.com/${REPOSITORY.replace('/', '\\/')}/releases/download/desktop-v[0-9][0-9.]*/[A-Za-z0-9._-]+_x64-setup\\.exe$`,
)

/**
 * The installer for 64-bit Windows named in a `latest.json`, or nothing. Only an installer of
 * this repository's own releases is taken: whatever the file says, a button never sends anyone
 * anywhere else.
 */
export const installerIn = (latest: unknown): { url: string; version: string } | undefined => {
  if (typeof latest !== 'object' || latest === null) return undefined
  const { version, platforms } = latest as { version?: unknown; platforms?: unknown }
  if (typeof platforms !== 'object' || platforms === null) return undefined
  const windows = (platforms as Record<string, unknown>)['windows-x86_64']
  if (typeof windows !== 'object' || windows === null) return undefined
  const { url } = windows as { url?: unknown }
  if (typeof url !== 'string' || !INSTALLER.test(url)) return undefined
  return { url, version: typeof version === 'string' ? version : '' }
}
