'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** The full editor stays beside a wide page; in one column it waits behind an explicit choice. */
export function MineFields({ label, children }: { label: string; children: ReactNode }) {
  const frame = useRef<HTMLDetailsElement>(null)
  const [wide, setWide] = useState(false)
  const [chosen, setChosen] = useState(false)
  useEffect(() => {
    const article = frame.current?.closest('.game')
    if (!article) {
      setWide(true)
      return
    }
    const measure = () => setWide(article.getBoundingClientRect().width >= 1008)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(article)
    return () => observer.disconnect()
  }, [])
  return (
    <details
      ref={frame}
      className="game-mine-fields"
      open={wide || chosen}
      onToggle={(event) => {
        if (!wide) setChosen(event.currentTarget.open)
      }}
    >
      <summary>{label}</summary>
      {children}
    </details>
  )
}
