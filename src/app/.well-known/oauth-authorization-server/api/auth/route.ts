import { handleAuth } from '@/server/auth/handler'

/**
 * RFC 8414: how an assistant signs in, for the issuer at /api/auth. The
 * address is the issuer's own, with the well-known part put first.
 */
export const GET = handleAuth
