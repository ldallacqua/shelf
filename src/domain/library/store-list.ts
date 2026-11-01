import { z } from 'zod'

import { storeNames } from '@/domain/library/stores'

/**
 * A list of stores as a request sends it. Apart from `stores.ts`, which the
 * library file's code reads on every shelf: Zod's weight stays off those pages.
 */
export const storeList = z.array(z.enum(storeNames)).max(storeNames.length)
