import { installerIn, LATEST_RELEASE, RELEASES_PAGE } from '@/domain/desktop/release'

/**
 * `/api/desktop/windows`: the newest Shelf for Windows installer. Every download button links
 * here, so the landing page, built ahead, never names a version a later release replaced: this
 * reads the newest release's `latest.json`, the file the installed app's updater reads, and sends
 * the browser to the installer it names, on this repository's releases only (`installerIn`).
 * When GitHub can't be read in time, the browser goes to the newest release's page instead,
 * where the installer is the first file.
 */
export async function GET() {
  let target = `${RELEASES_PAGE}/latest`
  try {
    const answer = await fetch(LATEST_RELEASE, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (answer.ok) target = installerIn(await answer.json())?.url ?? target
  } catch {
    // The releases page, as above.
  }
  return new Response(null, {
    status: 302,
    // A few minutes, so a burst of clicks asks GitHub once, and a new release arrives soon after.
    headers: { Location: target, 'Cache-Control': 'public, max-age=300' },
  })
}
