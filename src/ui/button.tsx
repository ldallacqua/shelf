import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-medium whitespace-nowrap select-none',
    'transition-[color,background-color,box-shadow] duration-quick ease-settle',
    'motion-safe:active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:shadow-glow focus-visible:shadow-glow',
        secondary: 'border border-line-strong bg-surface text-text hover:bg-surface-raised',
        ghost: 'text-text hover:bg-text/8',
        link: 'text-accent underline decoration-1 underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-10 px-4 pointer-coarse:h-11',
        sm: 'h-8 px-3 pointer-coarse:h-10',
        icon: 'size-10 pointer-coarse:size-11',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
)

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element with the button's look, for example a link. */
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
