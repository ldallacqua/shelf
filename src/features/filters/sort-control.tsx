'use client'

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ShuffleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { naturalSort, sortKeys, type Sort, type SortKey } from '@/domain/library/sort'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tip } from '@/ui/tooltip'

type SortControlProps = {
  sort: Sort
  onSort: (sort: Sort) => void
  /** Surprise me, again: a new seed. */
  onShuffle: () => void
  /** The menu's open state, so the S key can open it. */
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The sort (spec 6): a key from a menu, each starting the way a person
 * usually wants it, and a button that reverses it. Surprise me has no
 * direction; its button shuffles again.
 */
export function SortControl({ sort, onSort, onShuffle, open, onOpenChange }: SortControlProps) {
  const t = useTranslations('Sort')

  return (
    <div className="flex min-w-0 items-center gap-1 max-sm:flex-auto">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="min-w-0 max-sm:flex-auto max-sm:px-3">
            <span className="readout text-[0.625rem] text-muted max-sm:sr-only">{t('label')}</span>
            <span className="truncate">{t(`keys.${sort.key}`)}</span>
            <ChevronDownIcon aria-hidden="true" className="text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('menu')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort.key}
            onValueChange={(key) => {
              if (key === 'random') onShuffle()
              else onSort(naturalSort(key as SortKey))
            }}
          >
            {sortKeys.map((key) => (
              <DropdownMenuRadioItem key={key} value={key}>
                {t(`keys.${key}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {sort.key === 'random' ? (
        <Tip label={t('shuffle')}>
          <Button variant="secondary" size="icon" aria-label={t('shuffle')} onClick={onShuffle}>
            <ShuffleIcon aria-hidden="true" />
          </Button>
        </Tip>
      ) : (
        // Its name says which way it runs now; its tip, that pressing it reverses that.
        <Tip label={t('reverse')} describes>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t(sort.descending ? 'descending' : 'ascending', {
              key: t(`keys.${sort.key}`),
            })}
            onClick={() => onSort({ ...sort, descending: !sort.descending })}
          >
            {sort.descending ? (
              <ArrowDownIcon aria-hidden="true" />
            ) : (
              <ArrowUpIcon aria-hidden="true" />
            )}
          </Button>
        </Tip>
      )}
    </div>
  )
}
