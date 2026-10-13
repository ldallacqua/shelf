import type { ReactNode } from 'react'

import { Ledge, ShelfLabel } from '@/ui/ledge'

type EmptyLedgeProps = {
  /** The name on the shelf's label. */
  label: string
  title: string
  body: string
  /** One action, for example "Add your first game". */
  action?: ReactNode
}

/** An empty, lit shelf with one line under it. The empty state of any shelf. */
export function EmptyLedge({ label, title, body, action }: EmptyLedgeProps) {
  return (
    <div className="mx-auto w-full max-w-3xl pt-6 pb-16 sm:pt-10">
      <Ledge itemsClassName="h-40 sm:h-52" label={<ShelfLabel count={0}>{label}</ShelfLabel>} />
      <div className="mt-14 text-center">
        <p className="title text-xl text-balance sm:text-2xl">{title}</p>
        <p className="mt-3 text-pretty text-muted">{body}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  )
}
