'use client'

import dynamic from 'next/dynamic'
import { useEffect, useSyncExternalStore } from 'react'

import { useRouter } from '@/i18n/navigation'
import { Ghosts } from '@/ui/ghosts'

import { inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const DownloadsPage = dynamic(() => import('./downloads-page'), {
  ssr: false,
  loading: () => <Ghosts lines={3} className="mt-14 max-w-xl" />,
})

/** The page. In a browser there is nothing here to download with, and nowhere to say so: it goes home. */
export function DownloadsPageInApp() {
  const router = useRouter()
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => true)
  useEffect(() => {
    if (!inDesktopApp()) router.replace('/')
  }, [router])
  return app ? <DownloadsPage /> : null
}
