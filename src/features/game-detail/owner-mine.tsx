'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { useOwner } from '@/features/owner/owner'

import type { MineEditor as MineEditorType } from './mine-editor'

let code: Promise<typeof MineEditorType> | undefined

/** The editor's code: fetched only once the browser knows the owner is here. */
const loadEditor = () => (code ??= import('./mine-editor').then((module) => module.MineEditor))

type OwnerMineProps = {
  slug: string
  level: 'h2' | 'h3'
  minor: 'h3' | 'h4'
  /** After the game is removed: where to go. Without it, the library. */
  onRemoved?: () => void
  /** On a page of its own, which is drawn on the server: drawn again after each change. */
  refresh?: boolean
  /** What a visitor sees, and the owner until the editor is ready. */
  children: ReactNode
}

/**
 * "Mine", as the owner sees it: every field edited in place (spec 7.3). A
 * visitor gets the words alone, and never the editor's code.
 */
export function OwnerMine({ children, ...props }: OwnerMineProps) {
  const owner = useOwner().status === 'owner'
  const [Editor, setEditor] = useState<typeof MineEditorType>()

  useEffect(() => {
    if (!owner) return
    let current = true
    void loadEditor().then((editor) => current && setEditor(() => editor))
    return () => {
      current = false
    }
  }, [owner])

  if (!owner || !Editor) return children
  return <Editor {...props} fallback={children} />
}
