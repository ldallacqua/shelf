import { ChevronRightIcon, type LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { Link } from '@/i18n/navigation'
import { cn } from '@/ui/cn'

/**
 * The two ways settings' pages are listed (issue 152): a side list beside each page on a wide
 * window, and the list of every page with what each holds, which a phone opens first. Shared by
 * the site's pages and Shelf for Windows' own, which bring their own words.
 */

type Href = ComponentProps<typeof Link>['href']

/** A group's heading in either list: whose the pages under it are. */
export const groupHeadClass = 'readout px-3 text-[0.6875rem] text-muted uppercase'

const sideLinkClass = cn(
  'relative flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-medium text-muted',
  'transition-colors duration-quick ease-settle hover:bg-surface hover:text-text pointer-coarse:min-h-11',
  // The lit line, as the header's and the tabs' links have it, standing at the link's start.
  'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent before:opacity-0',
  'before:shadow-[0_0_calc(var(--glow)*12px)_var(--accent)]',
  'aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:before:opacity-100',
)

/** One page in the side list. */
export function SideLink({
  href,
  icon: Icon,
  current,
  children,
}: {
  href: Href
  icon: LucideIcon
  current: boolean
  children: ReactNode
}) {
  return (
    <li>
      <Link href={href} aria-current={current ? 'page' : undefined} className={sideLinkClass}>
        <Icon aria-hidden="true" className="size-4 flex-none" />
        {children}
      </Link>
    </li>
  )
}

/** A group of the side list. */
export function SideGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className={groupHeadClass}>{title}</p>
      <ul className="grid gap-0.5">{children}</ul>
    </div>
  )
}

/** One page in the list of every page: its name and what it holds. */
export function PageRow({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: Href
  icon: LucideIcon
  title: ReactNode
  description: ReactNode
}) {
  return (
    <li className="flex">
      <Link
        href={href}
        className="flex w-full items-center gap-4 rounded-panel border border-line bg-surface p-4 transition-colors duration-quick ease-settle hover:border-line-strong"
      >
        <span className="grid size-10 flex-none place-items-center rounded-control bg-accent/15 text-text">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-medium">{title}</span>
          <span className="text-sm text-pretty text-muted">{description}</span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 flex-none text-muted" />
      </Link>
    </li>
  )
}

/** A group of the list of every page. */
export function PageGroup({
  id,
  title,
  children,
}: {
  id: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className={cn(groupHeadClass, 'px-0')}>
        {title}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
    </section>
  )
}
