'use client'

import {
  ChevronDownIcon,
  Columns4Icon,
  LayoutGridIcon,
  ListIcon,
  RectangleVerticalIcon,
  Rows3Icon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { groupings, type Grouping } from '@/domain/library/group'
import type { View } from '@/domain/library/view'
import { Button } from '@/ui/button'
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
  /** This browser cannot draw 3D: the 3D button is disabled, and says why. */
  noThreeD?: boolean
}

const viewIcons = { shelf: Rows3Icon, wall: LayoutGridIcon, list: ListIcon } as const
const densityIcons = { covers: RectangleVerticalIcon, compact: Columns4Icon } as const

/**
 * The library's controls: which view, how it is grouped, and, per view, how
 * boxes stand or how large covers are. View and grouping live in the
 * address; the other two belong to this device.
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
  noThreeD = false,
}: ToolbarProps) {
  const t = useTranslations('Library')
  const reasonId = useId()

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      // On the narrowest phones the buttons give up padding, not their labels.
      className="library-controls flex items-center gap-2 sm:flex-wrap sm:gap-3 max-sm:[&_[data-slot=segmented-item]]:px-2.5"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="min-w-0 max-sm:flex-1 max-sm:px-3">
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
        {view === 'shelf' ? (
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
        ) : null}
        {view === 'shelf' && noThreeD ? (
          <span id={reasonId} className="sr-only">
            {t('dimension.unsupported')}
          </span>
        ) : null}

        {view === 'shelf' ? (
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
  )
}
