import {
  BookmarkIcon,
  CheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  ClockIcon,
  InboxIcon,
  InfinityIcon,
  PlayIcon,
  type LucideIcon,
} from 'lucide-react'

import type { Status } from '@/domain/library/values'
import { cn } from '@/ui/cn'

const icons: Record<Status, LucideIcon> = {
  playing: PlayIcon,
  backlog: CircleDashedIcon,
  // One day, after the backlog.
  someday: ClockIcon,
  completed: CheckIcon,
  // Done with a game that has no end.
  retired: InfinityIcon,
  dropped: CircleSlashIcon,
  wishlist: BookmarkIcon,
  // Came in from a sync, waiting for me to place it.
  unsorted: InboxIcon,
}

type StatusMarkProps = {
  status: Status
  /** The status in words. Always present for assistive technology; shown unless `iconOnly`. */
  label: string
  iconOnly?: boolean
  className?: string
}

/** A status as a shape and a word: never as a color alone. */
export function StatusMark({ status, label, iconOnly, className }: StatusMarkProps) {
  const Icon = icons[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        status === 'playing' && 'text-marker',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 flex-none" />
      <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
    </span>
  )
}
