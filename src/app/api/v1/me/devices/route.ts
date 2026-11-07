import { connection } from 'next/server'

import { apiDevices, ownerRead } from '@/server/api/writes'
import { myDevices } from '@/server/services/devices'

/**
 * `GET /api/v1/me/devices`: the signed-in account's computers with Shelf for Windows, and the names
 * it gave them, for its settings and its hours. Kept by nothing.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  const result = await myDevices()
  return ownerRead(apiDevices, result.ok ? { ok: true, value: { devices: result.value } } : result)
}
