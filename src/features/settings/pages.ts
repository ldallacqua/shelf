import {
  KeyRoundIcon,
  type LucideIcon,
  PaletteIcon,
  RefreshCwIcon,
  ShieldIcon,
  UserRoundIcon,
} from 'lucide-react'

/**
 * Settings' pages (issue 152), each an address of its own, grouped by whose choice it is: the
 * account's, wherever I sign in, or this device's. Shelf for Windows' own pages are a third group,
 * drawn only in the app, with words of its own (`features/desktop/settings-links.tsx`).
 */
export const accountPages = [
  { key: 'profile', href: '/settings/profile', icon: UserRoundIcon },
  { key: 'privacy', href: '/settings/privacy', icon: ShieldIcon },
  { key: 'platforms', href: '/settings/platforms', icon: RefreshCwIcon },
  { key: 'security', href: '/settings/security', icon: KeyRoundIcon },
] as const satisfies readonly SettingsPage[]

export const devicePages = [
  { key: 'appearance', href: '/settings/appearance', icon: PaletteIcon },
] as const satisfies readonly SettingsPage[]

export const appPages = ['app', 'download-sources', 'download-services'] as const
export type AppPage = (typeof appPages)[number]

type SettingsPage = { key: string; href: `/settings/${string}`; icon: LucideIcon }

export type PageKey =
  (typeof accountPages)[number]['key'] | (typeof devicePages)[number]['key'] | AppPage
