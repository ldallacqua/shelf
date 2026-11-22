import { PanelLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './button'
import { cn } from './cn'

type PanelToggleProps = {
  /** Whether the column is shown; undefined until the page knows (built ahead, not yet alive). */
  shown: boolean | undefined
  onToggle: () => void
  /** The id of the column it shows and hides. */
  controls: string
  /** Its words: what pressing it does. */
  children: ReactNode
  className?: string
}

/**
 * Shows or hides a column beside the page: the list beside a game, the library's filters. It
 * stands outside the column and is the same button in both states, so focus stays on it and the
 * same button brings the column back.
 */
export function PanelToggle({ shown, onToggle, controls, children, className }: PanelToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-10 flex-none gap-2 px-3 text-muted pointer-coarse:h-11', className)}
      // Unknown until the page is alive: then it says nothing rather than something untrue.
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
    >
      <PanelLeftIcon aria-hidden="true" />
      {children}
    </Button>
  )
}
