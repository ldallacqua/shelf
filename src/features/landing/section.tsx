import { Suspense, type ReactNode } from 'react'

import { Eyebrow, Page } from '@/features/shell/page'
import { cn } from '@/ui/cn'

type SectionProps = {
  id: string
  eyebrow: string
  title: string
  body: ReactNode
  /** Under the words: a note, or a control. */
  aside?: ReactNode
  /** The scene: the product doing what the words say. */
  children: ReactNode
  /** On a wide screen, the scene goes on the left. */
  flip?: boolean
  /** The scene takes the whole width, under the words. */
  wide?: boolean
}

/**
 * One part of the landing page's story: a heading and a line, and beside
 * them the product doing it. Both rise into place as they scroll into view.
 */
export function Section({ id, eyebrow, title, body, aside, children, flip, wide }: SectionProps) {
  const headingId = `${id}-title`
  return (
    // Each part hydrates on its own, in a task of its own, rather than all in one.
    <Suspense>
      <section
        id={id}
        aria-labelledby={headingId}
        className="landing-part scroll-mt-16 py-16 sm:py-24"
      >
        <Page
          className={cn(
            'grid grid-cols-[minmax(0,1fr)] items-center gap-x-16 gap-y-10',
            !wide &&
              (flip
                ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
                : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'),
          )}
        >
          <div className={cn('reveal', flip && !wide && 'lg:order-last')}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2 id={headingId} className="mt-3 title text-3xl text-balance sm:text-5xl">
              {title}
            </h2>
            <div className="mt-5 max-w-[46ch] text-lg text-pretty text-muted">{body}</div>
            {aside}
          </div>
          <div className="reveal min-w-0">{children}</div>
        </Page>
      </section>
    </Suspense>
  )
}
