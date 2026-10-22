'use client'

import { ChevronDownIcon, LibraryBigIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { SmartShelf } from '@/domain/library/shelves'
import { useShelf } from '@/features/library/shelf'
import { libraryHref, smartShelfHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

/** What a server action for shelves answers. */
export type ShelfWrite =
  | { ok: true; slug: string }
  | { ok: false; reason: 'not-signed-in' | 'invalid' | 'not-kept' | 'not-found' | 'failed' }

/** One's own ways to save and remove shelves, as server actions handed down by the page. */
export type ShelfActions = {
  save: (input: {
    slug?: string
    name: string
    query: string
    sort: string
    group: string
  }) => Promise<ShelfWrite>
  remove: (slug: string) => Promise<ShelfWrite>
}

/** The smart shelves, opened from the library's header (spec 5.5). */
export function ShelvesMenu({
  shelves,
  current,
}: {
  shelves: readonly Pick<SmartShelf, 'slug' | 'name'>[]
  current?: string
}) {
  const t = useTranslations('Shelves')
  const { handle } = useShelf()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="flex-none max-sm:px-3">
          <LibraryBigIcon aria-hidden="true" />
          <span className="max-sm:sr-only">{t('open')}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem asChild>
          <Link
            href={libraryHref(handle)}
            aria-current={current === undefined ? 'page' : undefined}
          >
            {t('all')}
          </Link>
        </DropdownMenuItem>
        {shelves.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
            {shelves.map((shelf) => (
              <DropdownMenuItem key={shelf.slug} asChild>
                <Link
                  href={smartShelfHref(handle, shelf.slug)}
                  aria-current={current === shelf.slug ? 'page' : undefined}
                  className="aria-[current=page]:font-semibold"
                >
                  {shelf.name}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
