'use client'

import AppUpdate from './app-update'
import DownloadsLink from './downloads-link'

/** What the header draws in Shelf for Windows alone, fetched as one file: an update ready, and the downloads. */
export default function InAppHeader() {
  return (
    <>
      <AppUpdate />
      <DownloadsLink />
    </>
  )
}
