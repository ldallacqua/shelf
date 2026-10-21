'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { useOwner } from '@/features/owner/owner'

import type { MineEditor as MineEditorType } from './mine-editor'

let code: Promise<typeof MineEditorType> | undefined
/** The editor once its code is here, so a game opened after the first is edited at once. */
let loaded: typeof MineEditorType | undefined

/**
 * The editor's code: fetched only once the browser knows the owner is here.
 * The library asks for it as soon as a game is reached for, ahead of the click.
 */
export const loadEditor = () =>
  (code ??= import('./mine-editor').then((module) => (loaded = module.MineEditor)))

type OwnerMineProps = {
  slug: string
  level: 'h2' | 'h3'
  minor: 'h3' | 'h4'
  /** After the game is removed: where to go. Without it, the library. */
  onRemoved?: () => void
  /** On a page of its own, which is drawn on the server: drawn again after each change. */
  refresh?: boolean
  /** What a visitor sees. */
  children: ReactNode
  /** The editor's shape, while it is on its way to the owner (`mine-skeleton.tsx`). */
  skeleton: ReactNode
}

/**
 * "Mine", as the owner sees it: every field edited in place (spec 7.3). A
 * visitor gets the words alone, and never the editor's code. While the
 * browser asks whether the owner is here, and then while the editor comes,
 * its skeleton holds its place, so what is below it does not jump down.
 */
export function OwnerMine({ children, skeleton, ...props }: OwnerMineProps) {
  const owner = useOwner().status
  const [Editor, setEditor] = useState(() => loaded)

  useEffect(() => {
    if (owner !== 'owner' || Editor) return
    let current = true
    void loadEditor().then((editor) => current && setEditor(() => editor))
    return () => {
      current = false
    }
  }, [owner, Editor])

  if (owner === 'visitor') return children
  if (owner === 'checking' || !Editor) return skeleton
  return <Editor {...props} fallback={skeleton} />
}
