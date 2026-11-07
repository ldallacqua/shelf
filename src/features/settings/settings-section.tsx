import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'

import { Scope, type ScopeOf } from './scope'

/** A settings page's title: the frame draws it, or Shelf for Windows' pages do, with their own words. */
export const titleClass = 'pt-3 title text-3xl sm:text-5xl lg:pt-14'

/** The sections of a settings page, one under another; the first needs no line of its own under the title. */
export const SECTIONS =
  'grid gap-10 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0'

/** A section's title, with whose the setting is beside it. */
export function SectionHead({
  id,
  title,
  scope,
}: {
  id?: string
  title: ReactNode
  scope: ScopeOf
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="title text-xl sm:text-2xl">
        {title}
      </h2>
      <Scope of={scope} />
    </div>
  )
}

/** One setting, or a few that go together, under its title. */
export function SettingsSection({
  title,
  scope,
  id,
  className,
  children,
}: {
  title: ReactNode
  scope: ScopeOf
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id ? `${id}-title` : undefined}
      id={id}
      className={cn('grid scroll-mt-24 gap-5 border-t border-line pt-8', className)}
    >
      <SectionHead id={id ? `${id}-title` : undefined} title={title} scope={scope} />
      {children}
    </section>
  )
}
