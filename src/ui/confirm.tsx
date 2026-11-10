'use client'

import { AlertDialog, Slot } from 'radix-ui'
import { type ReactElement, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'

type ConfirmProps = {
  /** The control that asks: one element that takes a ref, such as a button. */
  children: ReactElement
  title: string
  description: string
  /** The words on the button that goes ahead: what it does, never "OK". */
  confirm: string
  cancel: string
  onConfirm: () => void
}

/**
 * A question that must be answered before something that can't be undone.
 * Focus starts on the answer that changes nothing, Escape is that answer, and
 * focus goes back to the control that asked. For a page: inside a dialog, ask
 * with `ConfirmInPlace`, so the dialog stays the only layer.
 */
function Confirm({ children, title, description, confirm, cancel, onConfirm }: ConfirmProps) {
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

/**
 * The same question, asked where the control stands instead of in a layer of its own: for a control
 * inside a dialog, where a second modal would hide what the question is about (ADR 009). The question
 * opens just after the control; focus starts on the answer that changes nothing, Escape is that answer
 * and leaves the dialog open, and focus goes back to the control. Place it with `className` where its
 * parent lays out in a row.
 */
function ConfirmInPlace({
  children,
  title,
  description,
  confirm,
  cancel,
  onConfirm,
  className,
}: ConfirmProps & { className?: string }) {
  const [asking, setAsking] = useState(false)
  const id = useId()
  const asker = useRef<HTMLElement>(null)
  const question = useRef<HTMLDivElement>(null)
  const nothing = useRef<HTMLButtonElement>(null)

  const answered = () => {
    setAsking(false)
    // Once the question has gone, so focus lands on what asked and not where the question stood.
    requestAnimationFrame(() => asker.current?.focus())
  }

  useEffect(() => {
    const asked = question.current
    if (!asking || !asked) return
    nothing.current?.focus()
    // Escape is the answer that changes nothing; a dialog around it leaves it to this.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setAsking(false)
      requestAnimationFrame(() => asker.current?.focus())
    }
    asked.addEventListener('keydown', onKey)
    return () => asked.removeEventListener('keydown', onKey)
  }, [asking])

  return (
    <>
      <Slot.Root
        ref={asker}
        aria-expanded={asking}
        aria-controls={asking ? id : undefined}
        onClick={() => setAsking(true)}
      >
        {children}
      </Slot.Root>
      {asking ? (
        <div
          ref={question}
          id={id}
          role="group"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          data-confirming=""
          className={cn(
            'grid gap-1.5 rounded-control border border-line-strong bg-surface-raised p-3',
            className,
          )}
        >
          <p id={`${id}-title`} className="text-sm font-medium text-balance">
            {title}
          </p>
          <p id={`${id}-description`} className="text-sm text-pretty text-muted">
            {description}
          </p>
          <div className="mt-1.5 flex flex-wrap justify-end gap-2">
            <Button ref={nothing} variant="secondary" size="sm" onClick={answered}>
              {cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                answered()
                onConfirm()
              }}
            >
              {confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export { Confirm, ConfirmInPlace }
