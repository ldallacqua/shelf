import type { ComponentProps } from 'react'
import { vi } from 'vitest'

/**
 * A stand-in for `@/i18n/navigation` in component tests. The real module needs
 * a running Next.js router; this one renders plain links with the language
 * prefix the real one would add, and lets a test say which page it is on.
 *
 * Use it with:
 *   vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
 */
const state = { pathname: '/', locale: 'en' }

export function setPathname(pathname: string, locale = 'en'): void {
  state.pathname = pathname
  state.locale = locale
}

type Href =
  string | { pathname: string; params?: Record<string, string>; query?: Record<string, string> }

type LinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  href: Href
  locale?: string
  scroll?: boolean
  replace?: boolean
}

export function Link({
  href,
  locale,
  scroll: _scroll,
  replace: _replace,
  children,
  ...props
}: LinkProps) {
  const prefix = `/${locale ?? state.locale}`
  const path =
    typeof href === 'string'
      ? href
      : // A page with a part of its own, such as a shelf's slug, has it filled in.
        href.pathname.replace(/\[(\w+)\]/g, (_, name: string) => href.params?.[name] ?? name)
  const query = typeof href === 'string' ? '' : new URLSearchParams(href.query).toString()
  const address = `${prefix}${path === '/' ? '' : path}${query ? `?${query}` : ''}`
  return (
    <a href={address} {...props}>
      {children}
    </a>
  )
}

export const usePathname = () => state.pathname
export const useRouter = () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
export const redirect = vi.fn()
export const getPathname = ({ href, locale }: { href: string; locale: string }) =>
  `/${locale}${href === '/' ? '' : href}`
