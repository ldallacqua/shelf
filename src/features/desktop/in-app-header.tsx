'use client'

import AppUpdate from './app-update'
import DownloadsLink from './downloads-link'
import PlaceTrouble from './place-trouble'

/**
 * What the header draws in Shelf for Windows alone, fetched as one file: where the saves go when it
 * needs the person, an update ready, and the downloads.
 */
export default function InAppHeader() {
  return (
    <>
      <PlaceTrouble />
      <AppUpdate />
      <DownloadsLink />
    </>
  )
}
