import { cn } from '@/ui/cn'

type ProgressProps = {
  value: number
  max: number
  'aria-label': string
  className?: string
}

/** How far along something is: a bar that fills with the accent. */
function Progress({ value, max, className, ...props }: ProgressProps) {
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
