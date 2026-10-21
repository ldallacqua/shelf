import { handleAuth } from '@/server/auth/handler'

/**
 * Better Auth's routes: leaving for GitHub, coming back, the session, and
 * signing out; and for assistants, OAuth: authorizing, tokens, consent and
 * the keys tokens are signed with.
 */

export const GET = handleAuth
export const POST = handleAuth
