import type { Metadata } from 'next'

import { DownloadsPageInApp } from '@/features/desktop/downloads-later'
import { Page } from '@/features/shell/page'
import en from '@messages/app/en.json'

export const metadata: Metadata = {
  // The same word in every language here, and not in the words every visitor is sent (ADR 007, decision 4).
  title: en.Downloads.title,
  robots: { index: false, follow: false },
}

/** Downloads, in Shelf for Windows alone: built ahead as an empty frame, filled in the app. */
export default function DownloadsRoute() {
  return (
    <Page className="pb-16">
      <DownloadsPageInApp />
    </Page>
  )
}
