import { ghostOrder } from '@/ui/ghost'

import { GhostHeading } from './ghosts'

/*
 * The banner view's ghosts, apart from the view: drawn while its code is on its way, they are in
 * every library page, and the view is not (`banner-later.tsx`).
 */

/** A banner-shaped place, for a game on its way: the image and its two lines. */
export function GhostBanner({ index }: { index: number }) {
  return (
    <li
      className="banner-cell"
      data-cell=""
      data-ghost=""
      aria-hidden="true"
      style={ghostOrder(index)}
    >
      <span className="banner-box">
        <span className="banner-art ghost" />
        <span className="banner-info">
          <span className="ghost h-[0.8lh] w-3/5" />
          <span className="ghost h-[0.7lh] w-4/5" />
        </span>
      </span>
    </li>
  )
}

/** The banners before their shelves are known: two shelves' labels and banners. */
export function GhostBanners() {
  return (
    <div className="pb-6" aria-hidden="true">
      {[8, 4].map((count, shelf) => (
        <section key={shelf} className="mt-6 first:mt-4">
          <GhostHeading className="wall-label" />
          <ul className="banner-grid">
            {Array.from({ length: count }, (_, index) => (
              <GhostBanner key={index} index={index} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
