import { createMcpProtectedRequestHandler } from '@better-auth/mcp'
import { createMcpHandler } from '@modelcontextprotocol/server'

import { accountOfUser, asAccount } from '@/server/auth/account'
import { authIssuer, mcpResource } from '@/server/auth/auth'
import { ownerMcpServer } from '@/server/mcp/server'

/**
 * `POST /api/mcp/owner`: your own library, for an assistant you signed in,
 * to read and change (architecture, section 16; ADR 004). Without an access
 * token it answers 401, naming where to sign in: that is how an assistant
 * knows to start.
 *
 * The token is a JWT this deployment signed, for this endpoint, naming the
 * account that signed the assistant in. It is checked here, and the tools
 * then run as that account, through the same services as the site and the
 * API: on its library and no other.
 */

const noAccount = () =>
  Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'The account this token was given for is gone.' },
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
      const account = typeof claims.sub === 'string' ? await accountOfUser(claims.sub) : undefined
      if (!account) return noAccount()
      // A server of its own for each request: it reads this account's library.
      const handler = createMcpHandler(() => ownerMcpServer(account))
      return asAccount(account, () => handler.fetch(request))
    },
  ))

export const POST = (request: Request) => protectedHandler()(request)
