import { handleAuth } from '@/server/auth/handler'

/**
 * RFC 9728: what the owner's MCP endpoint is and who signs assistants in to
 * it. Where an assistant turned away by the endpoint is told to look.
 */
export const GET = handleAuth
