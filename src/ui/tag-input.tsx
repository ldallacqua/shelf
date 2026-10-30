'use client'

import { XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import { cn } from '@/ui/cn'
import { fieldClass } from '@/ui/field'
import { Tip } from '@/ui/tooltip'

type TagInputProps = {
  id?: string
  value: readonly string[]
  onChange: (tags: string[]) => void
  /** Tags already in use, most used first: offered as one is typed. */
  suggestions?: readonly string[]
  placeholder?: string
  labels: {
    /** The name of a tag's remove button. */
    remove: (tag: string) => string
    /** The name of the list of suggestions. */
    suggestions: string
  }
  disabled?: boolean
  'aria-describedby'?: string
  className?: string
}

/** At most this many suggestions at once. */
const SHOWN = 6

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/**
 * Tags, each a chip. Type one and press Enter or a comma; Backspace in the
 * empty field takes the last away; a pasted list is split at its commas.
 * Tags already in use are offered as you type: arrow keys move through
 * them, Enter takes one. A tag typed and left is kept.
 */
function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder,
  labels,
  disabled,
  className,
  ...props
}: TagInputProps) {
  const listId = useId()
  const field = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  // Escape put the suggestions away until the next keystroke.
  const [dismissed, setDismissed] = useState(false)

  const wanted = text.trim()
  const offered = wanted
    ? suggestions
        .filter(
          (tag) =>
            tag.toLocaleLowerCase().includes(wanted.toLocaleLowerCase()) &&
            !value.some((each) => same(each, tag)),
        )
        .slice(0, SHOWN)
    : []
  const open = focused && !dismissed && offered.length > 0

  // Escape with the suggestions open puts them away, and nothing else: a
  // sheet around the field listens for Escape on the document, before the
  // field hears it, so this listens on the window, before the sheet.
  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target !== field.current) return
      event.stopPropagation()
      setActive(-1)
      setDismissed(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const add = (written: readonly string[]) => {
    const next = [...value]
    for (const raw of written) {
      const tag = raw.trim()
      if (tag && !next.some((each) => same(each, tag))) next.push(tag)
    }
    setText('')
    setActive(-1)
    if (next.length !== value.length) onChange(next)
  }

  const remove = (tag: string) => {
    onChange(value.filter((each) => each !== tag))
    field.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault()
      setActive((at) => (at + 1) % offered.length)
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault()
      setActive((at) => (at <= 0 ? offered.length - 1 : at - 1))
    } else if (event.key === 'Enter' || event.key === ',') {
      const chosen = open && active >= 0 ? offered[active] : undefined
      if (!chosen && !wanted) return
      event.preventDefault()
      add([chosen ?? wanted])
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (!/[,\n]/.test(pasted)) return
    event.preventDefault()
    add([text, ...pasted.split(/[,\n]/)])
  }

  const optionId = (at: number) => `${listId}-${at}`

  return (
    <div className={cn('relative', className)}>
      {/* A press anywhere in the field is a press in its text box. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        data-slot="tag-input"
        onClick={() => field.current?.focus()}
        className={cn(
          fieldClass,
          'flex min-h-10 cursor-text flex-wrap items-center gap-1.5 px-1.5 py-1.5 pointer-coarse:min-h-11',
          'has-[input:focus-visible]:border-accent has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-text/8 pr-0.5 pl-2.5 text-sm"
          >
            <span className="truncate">{tag}</span>
            <Tip label={labels.remove(tag)}>
              <button
                type="button"
                aria-label={labels.remove(tag)}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  remove(tag)
                }}
                className="inline-flex size-6 flex-none items-center justify-center rounded-full text-muted transition-colors duration-quick ease-settle hover:bg-text/10 hover:text-text"
              >
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            </Tip>
          </span>
        ))}
        <input
          ref={field}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={props['aria-describedby']}
          autoComplete="off"
          enterKeyHint="enter"
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setActive(-1)
            setDismissed(false)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (wanted) add([wanted])
          }}
          className="h-7 min-w-24 flex-1 bg-transparent px-1.5 text-base text-text outline-none placeholder:text-muted sm:text-sm"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={labels.suggestions}
        hidden={!open}
        className="absolute inset-x-0 top-full z-20 mt-1.5 grid rounded-panel border border-line bg-surface-raised p-1 shadow-panel motion-safe:animate-menu-in"
      >
        {offered.map((tag, at) => (
          // Chosen with the keys in the field above (`aria-activedescendant`); a click is the pointer's way.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={tag}
            id={optionId(at)}
            role="option"
            aria-selected={at === active}
            // Keeps focus in the field, so leaving it does not add what was typed.
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => setActive(at)}
            onClick={() => add([tag])}
            className="flex min-h-9 cursor-default items-center rounded-[4px] px-2.5 text-sm aria-selected:bg-text/8 pointer-coarse:min-h-11"
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  )
}

export { TagInput }
