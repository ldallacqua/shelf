import {
  BookmarkIcon,
  CheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  PlayIcon,
  type LucideIcon,
} from 'lucide-react'

import type { Status } from '@/domain/library/values'
import { cn } from '@/ui/cn'

const icons: Record<Status, LucideIcon> = {
  playing: PlayIcon,
  backlog: CircleDashedIcon,
  completed: CheckIcon,
  dropped: CircleSlashIcon,
  wishlist: BookmarkIcon,
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
