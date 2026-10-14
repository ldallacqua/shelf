import 'server-only'

import { cookies } from 'next/headers'

import { mocksRequested } from '@/server/env'

/**
 * Whether the visitor is the owner, who may change things (spec 11).
 *
 * Sign-in arrives at step 7. Until then nobody is the owner, except in the
 * browser tests: with the test doubles on (`SHELF_MOCKS=1`, which refuses
 * to start on Vercel), a test signs in by setting this cookie. Without the
 * doubles the cookie is never even read, so a page that asks stays as fast
 * as one that does not.
 */
export const TEST_OWNER_COOKIE = 'shelf-test-owner'

export const isOwner = async (): Promise<boolean> => {
  if (!mocksRequested()) return false
  const jar = await cookies()
  return jar.get(TEST_OWNER_COOKIE)?.value === '1'
}
