'use client'

import {
  CirclePlayIcon,
  EyeOffIcon,
  ChevronDownIcon,
  Columns4Icon,
  FlaskConicalIcon,
  LayoutGridIcon,
  ListIcon,
  RectangleVerticalIcon,
  Rows3Icon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, type ReactNode } from 'react'

import { groupings, type Grouping } from '@/domain/library/group'
import type { View } from '@/domain/library/view'
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
import { Segmented, SegmentedItem } from '@/ui/segmented'

import {
  densities,
  dimensions,
  wallSizes,
  type Density,
  type Dimension,
  type WallSize,
} from './preferences'

type ToolbarProps = {
  view: View
  onView: (view: View) => void
  group: Grouping
  onGroup: (group: Grouping) => void
  density: Density
  onDensity: (density: Density) => void
  wallSize: WallSize
  onWallSize: (size: WallSize) => void
  dimension: Dimension
  onDimension: (dimension: Dimension) => void
  /** Experimental views are on, on this device: 2D or 3D and covers or compact are offered (issue 63). */
  experimental?: boolean
  /** This browser cannot draw 3D: the 3D button is disabled, and says why. */
  noThreeD?: boolean
  /** The group menu's open state, so the G key can open it. */
  groupOpen?: boolean
  onGroupOpen?: (open: boolean) => void
  /** The Filters button, first in the row. */
  filters?: ReactNode
  /** The sort, after the filters. */
  sort?: ReactNode
  /** Whether adult games are hidden on this device (spec 3.13); absent while the shelf has none. */
  adult?: { hidden: boolean; onChange: (hidden: boolean) => void }
  /** Whether only the games ready to play here are shown (spec 7.7): in the app, on my own shelf. */
  ready?: { on: boolean; onChange: (on: boolean) => void }
}

const viewIcons = { shelf: Rows3Icon, wall: LayoutGridIcon, list: ListIcon } as const
const densityIcons = { covers: RectangleVerticalIcon, compact: Columns4Icon } as const

/**
 * The library's controls: filters and sort, then grouping, which view, and,
 * per view, how large covers are, or, with experimental views on, how the
 * shelf is drawn and how boxes stand. Filters, sort, view and grouping live
 * in the address; the others belong to this device.
 */
export function Toolbar({
  view,
  onView,
  group,
  onGroup,
  density,
  onDensity,
  wallSize,
  onWallSize,
  dimension,
  onDimension,
  experimental = false,
  noThreeD = false,
  groupOpen,
  onGroupOpen,
  filters,
  sort,
  adult,
  ready,
}: ToolbarProps) {
  const t = useTranslations('Library')
  const reasonId = useId()

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      // On a phone, two rows: what is shown, then how. The buttons give up padding, not their labels.
      className="library-controls flex flex-wrap items-center gap-2 sm:mt-3 sm:gap-3 max-sm:[&_[data-slot=segmented-item]]:px-2.5"
    >
      {/* What is shown, and in what order: a phone's first row. */}
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:contents">
        {filters}
        {sort}
        {ready ? (
          <Button
            variant="secondary"
            aria-pressed={ready.on}
            // Shelf for Windows' own: `pnpm desktop:check` reads pages without it.
            data-play=""
            className={cn('flex-none max-sm:px-3', ready.on && 'border-accent bg-accent/15')}
            onClick={() => ready.onChange(!ready.on)}
          >
            <CirclePlayIcon aria-hidden="true" />
            {t('ready.label')}
          </Button>
        ) : null}
      </div>

      {/* How it is laid out: a phone's second row. */}
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:contents">
        <DropdownMenu open={groupOpen} onOpenChange={onGroupOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="min-w-0 max-sm:flex-auto max-sm:px-3">
              <span className="readout text-[0.625rem] text-muted max-sm:sr-only">
                {t('group.label')}
              </span>
              <span className="truncate">{t(`group.${group}`)}</span>
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

        <div className="ml-auto flex flex-none items-center gap-2 sm:gap-3">
          {view === 'shelf' && experimental ? (
            // Unfinished (issue 63), and said so: offered only once this device asked for them.
            <div
              role="group"
              aria-label={t('experimental.label')}
              className="flex items-center gap-2 sm:gap-3"
            >
              <span
                aria-hidden="true"
                title={t('experimental.label')}
                className="flex items-center gap-1 readout text-[0.625rem] text-muted"
              >
                <FlaskConicalIcon className="size-3.5" />
                <span className="max-lg:hidden">{t('experimental.tag')}</span>
              </span>
              <Segmented
                aria-label={t('dimension.label')}
                data-preference="shelf-mode"
                // A phone is not offered 3D (TOO_SMALL_FOR_3D), so there is nothing to choose.
                // Hidden by CSS, so it is right from the first paint.
                className="too-small-for-3d:hidden"
                value={dimension}
                onValueChange={(value) => {
                  if (!(value === '3d' && noThreeD)) onDimension(value)
                }}
              >
                {dimensions.map((value) => (
                  <SegmentedItem
                    key={value}
                    value={value}
                    // Unavailable, not disabled: it stays in reach of the keyboard, so its reason can be heard.
                    aria-disabled={value === '3d' && noThreeD ? true : undefined}
                    aria-describedby={value === '3d' && noThreeD ? reasonId : undefined}
                    title={value === '3d' && noThreeD ? t('dimension.unsupported') : undefined}
                    className="aria-disabled:opacity-50"
                  >
                    {t(`dimension.${value}`)}
                  </SegmentedItem>
                ))}
              </Segmented>
              {noThreeD ? (
                <span id={reasonId} className="sr-only">
                  {t('dimension.unsupported')}
                </span>
              ) : null}

              <Segmented
                aria-label={t('density.label')}
                data-preference="density"
                value={density}
                onValueChange={onDensity}
              >
                {densities.map((value) => {
                  const Icon = densityIcons[value]
                  return (
                    <SegmentedItem key={value} value={value} aria-label={t(`density.${value}`)}>
                      <Icon aria-hidden="true" className="sm:hidden" />
                      <span className="max-sm:hidden">{t(`density.${value}`)}</span>
                    </SegmentedItem>
                  )
                })}
              </Segmented>
            </div>
          ) : null}

          {view === 'wall' ? (
            <Segmented
              aria-label={t('wallSize.label')}
              data-preference="wall-size"
              value={wallSize}
              onValueChange={onWallSize}
            >
              {wallSizes.map((value) => (
                <SegmentedItem key={value} value={value} aria-label={t(`wallSize.${value}`)}>
                  <span aria-hidden="true">{t(`wallSize.short.${value}`)}</span>
                </SegmentedItem>
              ))}
            </Segmented>
          ) : null}

          {adult ? (
            <Button
              variant="secondary"
              aria-pressed={adult.hidden}
              aria-label={t('adult.hide')}
              data-preference="adult"
              className={cn('flex-none max-sm:px-3', adult.hidden && 'border-accent bg-accent/15')}
              onClick={() => adult.onChange(!adult.hidden)}
            >
              <EyeOffIcon aria-hidden="true" />
              <span aria-hidden="true" className="max-lg:hidden">
                {t('adult.hide')}
              </span>
            </Button>
          ) : null}

          <Segmented aria-label={t('view.label')} value={view} onValueChange={onView}>
            {(Object.keys(viewIcons) as View[]).map((value) => {
              const Icon = viewIcons[value]
              return (
                <SegmentedItem key={value} value={value} aria-label={t(`view.${value}`)}>
                  <Icon aria-hidden="true" />
                  <span className="max-md:hidden">{t(`view.${value}`)}</span>
                </SegmentedItem>
              )
            })}
          </Segmented>
        </div>
      </div>
    </div>
  )
}
