'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { useAccount } from '@/features/owner/account'

import type { MineEditor as MineEditorType } from './mine-editor'

let code: Promise<typeof MineEditorType> | undefined
/** The editor once its code is here, so a game opened after the first is edited at once. */
let loaded: typeof MineEditorType | undefined

/**
 * The editor's code: fetched only once the browser knows the shelf is the
 * signed-in account's own. The library asks for it as soon as a game is
 * reached for, ahead of the click.
 */
export const loadEditor = () =>
  (code ??= import('./mine-editor').then((module) => (loaded = module.MineEditor)))

type OwnerMineProps = {
  /** Whose shelf the game is on: its account alone gets the editor. */
  handle: string
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
 * "Mine", as the shelf's own account sees it: every field edited in place
 * (spec 7.3). Anyone else gets the words alone, and never the editor's
 * code. While the browser asks who is signed in, and then while the editor
 * comes, its skeleton holds its place, so what is below it does not jump.
 */
export function OwnerMine({ children, skeleton, handle, ...props }: OwnerMineProps) {
  const account = useAccount()
  const mine = account.status === 'signed-in' && account.handle === handle
  const [Editor, setEditor] = useState(() => loaded)

  useEffect(() => {
    if (!mine || Editor) return
    let current = true
    void loadEditor().then((editor) => current && setEditor(() => editor))
    return () => {
      current = false
    }
  }, [mine, Editor])

  if (account.status === 'checking') return skeleton
  if (!mine) return children
  if (!Editor) return skeleton
  return <Editor {...props} fallback={skeleton} />
}
