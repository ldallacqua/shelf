import { createMcpProtectedRequestHandler } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'

import { authIssuer, mcpResource } from '@/server/auth/auth'
import { asOwner, ownerOfUser } from '@/server/auth/owner'
import { ownerMcpServer } from '@/server/mcp/server'

/**
 * `POST /api/mcp/owner`: the library for an assistant I signed in, to read
 * and change (architecture, section 16). Without an access token it answers
 * 401, naming where to sign in: that is how an assistant knows to start.
 *
 * The token is a JWT this deployment signed, for this endpoint. It is
 * checked here, its user is checked to be the owner, and the tools then run
 * as the owner, through the same services as the site and the API.
 */

const handler = createMcpHandler(() => ownerMcpServer())

const notTheOwner = () =>
  Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Only the owner can use this endpoint.' },
      id: null,
    },
    { status: 403 },
  )

let serve: ((request: Request) => Promise<Response>) | undefined

/** Made on first use: the addresses are this deployment's, read from its settings. */
const protectedHandler = () =>
  (serve ??= createMcpProtectedRequestHandler(
    { issuer: authIssuer(), audience: mcpResource(), jwksUrl: `${authIssuer()}/jwks` },
    async (request, claims) => {
      const owner = typeof claims.sub === 'string' ? await ownerOfUser(claims.sub) : undefined
      if (!owner) return notTheOwner()
      return asOwner(owner, () => handler.fetch(request))
    },
  ))

export const POST = (request: Request) => protectedHandler()(request)
