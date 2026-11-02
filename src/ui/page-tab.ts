import { cn } from '@/ui/cn'

/**
 * A tab that is a page of its own, so it is an address and works without a script. Say which is
 * current with `aria-current="page"`. Tabs that only swap a panel are `ui/tabs.tsx`.
 */
export const pageTabClass = cn(
  'relative flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium whitespace-nowrap text-muted',
  'transition-colors duration-quick ease-settle hover:text-text',
  // The lit line inside the tab's box: the row scrolls sideways on a phone, and a line past it would scroll too.
  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:opacity-0',
  'after:shadow-[0_0_calc(var(--glow)*12px)_var(--accent)]',
  'aria-[current=page]:text-text aria-[current=page]:after:opacity-100',
)
