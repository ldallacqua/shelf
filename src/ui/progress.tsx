import { cn } from '@/ui/cn'

type ProgressProps = {
  /** Left out when how far along isn't known: the bar says only that something is moving. */
  value?: number | undefined
  max?: number | undefined
  'aria-label': string
  className?: string
}

/** How far along something is: a bar that fills with the accent. */
function Progress({ value, max, className, ...props }: ProgressProps) {
  if (value === undefined || max === undefined) {
    return (
      <div
        data-slot="progress"
        role="progressbar"
        aria-label={props['aria-label']}
        className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
      >
        <div className="h-full w-1/3 rounded-full bg-accent/70 motion-safe:animate-progress-slide" />
      </div>
    )
  }
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={props['aria-label']}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className="h-full origin-left rounded-full bg-accent motion-safe:transition-[scale] motion-safe:duration-base motion-safe:ease-settle"
        style={{ scale: `${share} 1` }}
      />
    </div>
  )
}

export { Progress }
