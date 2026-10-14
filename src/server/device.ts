import 'server-only'

/**
 * Whether a request comes from a phone, as far as the request says.
 *
 * Browsers built on Chromium say so in a header of its own. The others are
 * read from the user agent, where "Mobi" is the word every phone browser
 * includes and tablets and desktops leave out.
 *
 * Use it only for a guess that is harmless when wrong, such as how many
 * boxes to send with the page. What a page looks like is decided by CSS.
 */
export const isPhone = (headers: Pick<Headers, 'get'>): boolean => {
  const hint = headers.get('sec-ch-ua-mobile')
  if (hint) return hint.trim() === '?1'
  return /Mobi/i.test(headers.get('user-agent') ?? '')
}
