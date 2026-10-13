import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

// Wrappers around Next's navigation that keep the language prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
