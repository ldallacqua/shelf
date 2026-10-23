import { STEAM_OPENID } from '@/domain/sync/steam'
import { MOCK_STEAM } from '@/server/mocks/owner'

/**
 * What Steam's sign-in page sends the browser back with, for a made-up
 * account, signed so that the Steam double's check says yes. While the test
 * doubles answer, "Sign in through Steam" comes straight back with this
 * instead of leaving for Steam. No test library is needed to make it, so the
 * route can use it without carrying the doubles.
 */

/** What the double signs a sign-in answer with; Steam's check says yes only to this. */
export const MOCK_STEAM_SIGNATURE = 'test-doubles-only-steam-signature'

export const mockSteamAnswer = (
  returnTo: string,
  steamId: string = MOCK_STEAM.steamId,
  nonce = `${new Date().toISOString().slice(0, 19)}Z${Math.random().toString(36).slice(2)}`,
): URLSearchParams => {
  const claimed = `https://steamcommunity.com/openid/id/${steamId}`
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID,
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': nonce,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': MOCK_STEAM_SIGNATURE,
  })
}
