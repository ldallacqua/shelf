'use client'

import { ChevronDownIcon, CirclePlayIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { groupings, type Grouping } from '@/domain/library/group'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tip } from '@/ui/tooltip'

/** Filters share one row and one height; the desktop-only play filter is always last. */
export function ListControls({
  group,
  onGroup,
  ready,
  onReady,
}: {
  group: Grouping
  onGroup: (group: Grouping) => void
  ready?: boolean
  onReady?: () => void
}) {
  const t = useTranslations('Library')
  return (
    <div className="flex min-w-0 items-center gap-2" data-slot="list-controls">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 min-w-0 flex-1 justify-between gap-2 px-2"
          >
            <span className="text-xs font-normal text-muted">{t('group.label')}</span>
            <span className="ml-auto truncate">{t(`group.${group}`)}</span>
            <ChevronDownIcon aria-hidden="true" className="text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('group.menu')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={group}
            onValueChange={(value) => onGroup(value as Grouping)}
          >
            {groupings.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {t(`group.${value}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {ready !== undefined ? (
        <Tip label={t('ready.label')}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('ready.label')}
            aria-pressed={ready}
            data-play=""
            className={cn('size-10', ready && 'bg-accent/15 text-accent')}
            onClick={onReady}
          >
            <CirclePlayIcon aria-hidden="true" />
          </Button>
        </Tip>
      ) : null}
    </div>
  )
}
