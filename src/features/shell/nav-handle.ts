'use client'

import { useParams } from 'next/navigation'

import { useAccount } from '@/features/owner/account'

/**
 * Whose shelf the header's links are for (ADR 004): the one in the address,
 * or, on a page that is no one's shelf, one's own once the browser knows who
 * is signed in. A visitor away from any shelf has none.
 */
export const useNavHandle = (): string | undefined => {
  const params = useParams<{ handle?: string }>()
  const account = useAccount()
  const inAddress = typeof params?.handle === 'string' ? params.handle : undefined
  return inAddress ?? (account.status === 'signed-in' ? account.handle : undefined)
}

/** Before the address is known: one's own shelf, once the browser knows who is signed in. */
export const useOwnHandle = (): string | undefined => {
  const account = useAccount()
  return account.status === 'signed-in' ? account.handle : undefined
}
