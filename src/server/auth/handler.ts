import 'server-only'

import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/server/auth/auth'
import { MissingSettingsError } from '@/server/env'

/**
 * A request for Better Auth: its own routes under /api/auth, and the two
 * discovery documents assistants look for at the site's root. A deployment
 * without sign-in's settings says which are missing, by name, and serves
 * every page as before.
 */
export const handleAuth = async (request: Request): Promise<Response> => {
  try {
    const handler = toNextJsHandler(auth())
    return await (request.method === 'GET' ? handler.GET(request) : handler.POST(request))
  } catch (error) {
    if (error instanceof MissingSettingsError) {
      return Response.json({ message: error.message }, { status: 503 })
    }
    throw error
  }
}
