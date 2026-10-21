'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, type KeyboardEvent } from 'react'

import { parseQuery } from '@/domain/query/parse'
import { cn } from '@/ui/cn'

/** Where `/` takes the keyboard (spec 3.11). */
export const SEARCH_ID = 'library-search'

type SearchFieldProps = {
  /** The filter, as the address has it. */
  value: string
  /**
   * Called on every change. `typing` is true after the first change since
   * the field was focused, so a search being typed is one step in the
   * browser's history, not one per letter.
   */
  onChange: (text: string, typing: boolean) => void
  className?: string
}

/**
 * The search field (spec 3.1): titles as you type, and the whole filter
 * language besides. It shows the filter as text, so the panel and the
 * field are two views of one filter: a value picked in the panel appears
 * here, and a condition typed here appears in the panel.
 *
 * What cannot be understood is underlined where it stands. The text behind
 * the field is a copy of it, drawn transparent but for those underlines,
 * and kept scrolled with it.
 */
export function SearchField({ value, onChange, className }: SearchFieldProps) {
  const t = useTranslations('Filters')
  const input = useRef<HTMLInputElement>(null)
  const mirror = useRef<HTMLSpanElement>(null)
  const typing = useRef(false)
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(value)
  // The last text this field gave the address: what comes back as its echo.
  const [sent, setSent] = useState(value)

  // The address changed from elsewhere (the panel, a chip, Back): follow it.
  // While typing, the address echoes what was typed; that is not followed,
  // so the caret stays where it is.
  if (value !== seen) {
    setSeen(value)
    if (!focused || value !== sent) {
      setText(value)
      setSent(value)
    }
  }

  const problems = parseQuery(text).problems
  const pieces: { text: string; ignored: boolean }[] = []
  let at = 0
  for (const problem of problems) {
    if (problem.from < at) continue
    pieces.push({ text: text.slice(at, problem.from), ignored: false })
    pieces.push({ text: text.slice(problem.from, problem.to), ignored: true })
    at = problem.to
  }
  pieces.push({ text: text.slice(at), ignored: false })

  const follow = () => {
    requestAnimationFrame(() => {
      if (mirror.current && input.current) {
        mirror.current.style.transform = `translateX(${-input.current.scrollLeft}px)`
      }
    })
  }

  const change = (next: string) => {
    setText(next)
    setSent(next)
    onChange(next, typing.current)
    typing.current = true
    follow()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && text !== '') {
      event.preventDefault()
      change('')
    }
  }

  return (
    <div role="search" className={cn('relative flex min-w-0 items-center', className)}>
      <label htmlFor={SEARCH_ID} className="sr-only">
        {t('search.label')}
      </label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 size-4 text-muted"
      />
      {problems.length > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-10 left-9 flex items-center overflow-hidden text-base whitespace-pre text-transparent sm:text-sm"
        >
          <span ref={mirror}>
            {pieces.map((piece, index) =>
              piece.ignored ? (
                <span
                  key={index}
                  className="underline decoration-text decoration-wavy decoration-1 underline-offset-4"
                >
                  {piece.text}
                </span>
              ) : (
                piece.text
              ),
            )}
          </span>
        </span>
      ) : null}
      <input
        ref={input}
        id={SEARCH_ID}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={t('search.placeholder')}
        aria-describedby={problems.length > 0 ? `${SEARCH_ID}-ignored` : undefined}
        value={text}
        onChange={(event) => change(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={follow}
        onSelect={follow}
        onFocus={() => {
          setFocused(true)
          typing.current = false
        }}
        onBlur={() => {
          setFocused(false)
          // What was typed is the address now; show it as the address has it.
          setText(value)
        }}
        className={cn(
          // Sixteen pixels on a phone, so focusing the field never zooms the page.
          'h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface pr-10 pl-9 text-base text-text sm:text-sm',
          'placeholder:text-muted',
          'transition-[border-color,box-shadow] duration-quick ease-settle hover:border-text/40',
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          'pointer-coarse:h-11',
        )}
      />
      {problems.length > 0 ? (
        <span id={`${SEARCH_ID}-ignored`} className="sr-only">
          {t('search.ignored', { count: problems.length })}
        </span>
      ) : null}
      {text !== '' ? (
        <button
          type="button"
          aria-label={t('search.clear')}
          onClick={() => {
            change('')
            input.current?.focus()
          }}
          className={cn(
            'absolute right-1 inline-flex size-8 items-center justify-center rounded-control text-muted',
            'transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text',
            'pointer-coarse:size-10',
          )}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
