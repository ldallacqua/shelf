'use client'

import { AlertDialog } from 'radix-ui'
import type { ReactElement } from 'react'

import { Button } from '@/ui/button'

/**
 * A question that must be answered before something that can't be undone.
 * Focus starts on the answer that changes nothing, Escape is that answer, and
 * focus goes back to the control that asked.
 */
function Confirm({
  children,
  title,
  description,
  confirm,
  cancel,
  onConfirm,
}: {
  /** The control that asks: one element that takes a ref, such as a button. */
  children: ReactElement
  title: string
  description: string
  /** The words on the button that goes ahead: what it does, never "OK". */
  confirm: string
  cancel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-cinema/70 data-[state=open]:animate-fade-in" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[60] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-panel border border-line bg-surface-raised p-5 shadow-panel data-[state=open]:animate-fade-in">
          <AlertDialog.Title className="title text-lg text-balance">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-pretty text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" size="sm">
                {cancel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="primary" size="sm" onClick={onConfirm}>
                {confirm}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export { Confirm }
