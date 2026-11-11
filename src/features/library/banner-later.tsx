'use client'

import dynamic from 'next/dynamic'

import { GhostBanners } from './banner-ghosts'

/**
 * The banner view, its code fetched only when it is drawn. A page loads every client component it
 * imports, drawn or not, so imported directly it would weigh on every library page, whatever its
 * view. The server still draws it, when the address asks for banners.
 */
export const BannerViewLater = dynamic(
  () => import('./banner-view').then((module) => module.BannerView),
  { loading: () => <GhostBanners /> },
)
