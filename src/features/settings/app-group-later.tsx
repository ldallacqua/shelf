'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'

import { inDesktopApp } from '@/features/desktop/tauri'

import type { AppPage } from './pages'
import { groupHeadClass } from './settings-links'

const unchanging = () => () => undefined
const yes = () => true
const no = () => false

/** The group's place while its words are on their way: its heading and three pages. */
function AppGroupGhost({ as }: { as: 'side' | 'rows' }) {
  return (
    <div aria-hidden="true" className="grid gap-3">
      <span className={groupHeadClass}>
        <span className="ghost inline-block h-2.5 w-28" />
      </span>
      <div className={as === 'side' ? 'grid gap-0.5' : 'grid gap-3 md:grid-cols-2'}>
        {[0, 1, 2].map((index) =>
          as === 'side' ? (
            <span
              key={index}
              className="flex min-h-10 items-center gap-3 px-3 pointer-coarse:min-h-11"
            >
              <span className="ghost size-4 flex-none rounded-control" />
              <span className="ghost h-3 w-24" />
            </span>
          ) : (
            <span key={index} className="ghost h-[4.625rem] rounded-panel" />
          ),
        )}
      </div>
    </div>
  )
}

const SideAppGroup = dynamic(
  () => import('@/features/desktop/settings-links').then((module) => module.SideAppGroup),
  { ssr: false, loading: () => <AppGroupGhost as="side" /> },
)

const RowsAppGroup = dynamic(
  () => import('@/features/desktop/settings-links').then((module) => module.RowsAppGroup),
  { ssr: false, loading: () => <AppGroupGhost as="rows" /> },
)

/**
 * Shelf for Windows' own pages, in either list (issue 152): only in the app, which alone fetches
 * their code and words (ADR 007, decision 4). Before the page comes alive, the app's mark on
 * `<html>` (`frameless`) holds their place, and a browser draws nothing of them. `data-device`
 * leaves them out of what `pnpm desktop:check` compares with a plain browser.
 */
export function AppGroupLater({ as, current }: { as: 'side' | 'rows'; current?: AppPage }) {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  const alive = useSyncExternalStore(unchanging, yes, no)
  // Alive in a browser, the place held for the app is let go: nothing of the app's is coming.
  if (alive && !app) return null
  return (
    <div data-device className={app ? undefined : 'hidden frameless:block'}>
      {!app ? (
        <AppGroupGhost as={as} />
      ) : as === 'side' ? (
        <SideAppGroup current={current} />
      ) : (
        <RowsAppGroup />
      )}
    </div>
  )
}
