import { z } from 'zod'

import { apiChanged, apiDeviceName, bodyOf, refused, written } from '@/server/api/writes'
import { renameDevice } from '@/server/services/devices'

/** Shelf for Windows' own id for a computer. */
const deviceId = z.uuid()

/**
 * `PUT /api/v1/me/devices/{id}`: names one of the signed-in account's computers, or takes its name
 * away, from the settings of Shelf for Windows on it.
 */
export async function PUT(request: Request, { params }: RouteContext<'/api/v1/me/devices/[id]'>) {
  const id = deviceId.safeParse((await params).id)
  const parsed = apiDeviceName.safeParse(await bodyOf(request))
  if (!id.success || !parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(apiChanged, await renameDevice(id.data, parsed.data.name))
}
