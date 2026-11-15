'use client'

import {
  CirclePlayIcon,
  ChevronDownIcon,
  Columns4Icon,
  FlaskConicalIcon,
  GroupIcon,
  KeyboardIcon,
  LayoutGridIcon,
  ListIcon,
  RectangleVerticalIcon,
  RectangleHorizontalIcon,
  Rows3Icon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, type ReactNode } from 'react'

import { groupings, type Grouping } from '@/domain/library/group'
import { views, type View } from '@/domain/library/view'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Tip } from '@/ui/tooltip'

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
  /** Whether only the games ready to play here are shown (spec 7.7): in the app, on my own shelf. */
  ready?: { on: boolean; onChange: (on: boolean) => void }
  /** Opens the list of keyboard shortcuts, which is also where they are turned off and on. */
  onShortcuts?: () => void
}

const viewIcons = {
  shelf: Rows3Icon,
  wall: LayoutGridIcon,
  list: ListIcon,
  banner: RectangleHorizontalIcon,
} as const
const densityIcons = { covers: RectangleVerticalIcon, compact: Columns4Icon } as const

/**
 * The library's controls: filters and sort, then grouping, which view, and,
 * per view, how large covers are, or, with experimental views on, how the
 * shelf is drawn and how boxes stand. Filters, sort, view and grouping live
 * in the address; the others belong to this device.
 *
 * On a phone they are one row at the foot of the screen, so the games keep
 * the room (spec 3.4): what is shown and in what order, then one menu for how
 * it is laid out. Wider, each control stands on its own.
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
  ready,
  onShortcuts,
}: ToolbarProps) {
  const t = useTranslations('Library')
  const shortcuts = useTranslations('Shortcuts')
  const reasonId = useId()

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      className="library-controls flex items-center gap-2 sm:mt-3 sm:flex-wrap lg:gap-3"
    >
      {/* What is shown, and in what order. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:contents">
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

      {/* How it is laid out: on a phone, one menu. */}
      <LayoutMenu
        view={view}
        onView={onView}
        group={group}
        onGroup={onGroup}
        wallSize={wallSize}
        onWallSize={onWallSize}
        density={density}
        onDensity={onDensity}
        experimental={experimental}
      />

      {/* Wider, each control on its own. */}
      <div className="contents max-sm:hidden">
        <DropdownMenu open={groupOpen} onOpenChange={onGroupOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="min-w-0 max-lg:px-3">
              {/* Below lg an icon says what the button changes, in less room than the word. */}
              <GroupIcon aria-hidden="true" className="text-muted lg:hidden" />
              <span className="readout text-[0.625rem] text-muted max-lg:sr-only">
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

        <div className="ml-auto flex flex-none items-center gap-2 lg:gap-3">
          {view === 'shelf' && experimental ? (
            // Unfinished (issue 63), and said so: offered only once this device asked for them.
            <div
              role="group"
              aria-label={t('experimental.label')}
              className="flex items-center gap-2 lg:gap-3"
            >
              {/* Its words for a pointer where only the flask shows; the group already says them. */}
              <Tip label={t('experimental.label')} className="lg:hidden">
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1 readout text-[0.625rem] text-muted"
                >
                  <FlaskConicalIcon className="size-3.5" />
                  <span className="max-lg:hidden">{t('experimental.tag')}</span>
                </span>
              </Tip>
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
                {dimensions.map((value) => {
                  const unavailable = value === '3d' && noThreeD
                  const item = (
                    <SegmentedItem
                      key={value}
                      value={value}
                      // Unavailable, not disabled: it stays in reach of the keyboard, so its reason can be heard.
                      aria-disabled={unavailable ? true : undefined}
                      aria-describedby={unavailable ? reasonId : undefined}
                      className="aria-disabled:opacity-50"
                    >
                      {t(`dimension.${value}`)}
                    </SegmentedItem>
                  )
                  // Why, for a pointer: a screen reader has it from the reason below.
                  return unavailable ? (
                    <Tip key={value} label={t('dimension.unsupported')}>
                      {item}
                    </Tip>
                  ) : (
                    item
                  )
                })}
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
                {densities.map((value) => (
                  <SegmentedItem key={value} value={value}>
                    {t(`density.${value}`)}
                  </SegmentedItem>
                ))}
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
                <Tip key={value} label={t(`wallSize.${value}`)}>
                  <SegmentedItem value={value} aria-label={t(`wallSize.${value}`)}>
                    <span aria-hidden="true">{t(`wallSize.short.${value}`)}</span>
                  </SegmentedItem>
                </Tip>
              ))}
            </Segmented>
          ) : null}

          <Segmented aria-label={t('view.label')} value={view} onValueChange={onView}>
            {views.map((value) => {
              const Icon = viewIcons[value]
              return (
                // Icons until lg, so the row holds every control from 640 up.
                <Tip key={value} label={t(`view.${value}`)} className="lg:hidden">
                  <SegmentedItem value={value} aria-label={t(`view.${value}`)}>
                    <Icon aria-hidden="true" />
                    <span className="max-lg:hidden">{t(`view.${value}`)}</span>
                  </SegmentedItem>
                </Tip>
              )
            })}
          </Segmented>

          {onShortcuts ? (
            // The way to the list that is not a key, for a keyboard: where shortcuts are turned back on.
            <Tip label={shortcuts('title')}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={shortcuts('title')}
                className="max-lg:hidden"
                onClick={onShortcuts}
              >
                <KeyboardIcon aria-hidden="true" />
              </Button>
            </Tip>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type LayoutMenuProps = Pick<
  ToolbarProps,
  | 'view'
  | 'onView'
  | 'group'
  | 'onGroup'
  | 'wallSize'
  | 'onWallSize'
  | 'density'
  | 'onDensity'
  | 'experimental'
>

/**
 * A phone's way to the view, the grouping and, per view, the covers' size: one button at the
 * row's end, drawn as the view it shows, so what is shown and in what order keep their words.
 */
export function LayoutMenu({
  view,
  onView,
  group,
  onGroup,
  wallSize,
  onWallSize,
  density,
  onDensity,
  experimental = false,
}: LayoutMenuProps) {
  const t = useTranslations('Library')
  const Icon = viewIcons[view]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className="flex-none gap-1 px-2.5 sm:hidden"
          aria-label={t('layout.button', {
            view: t(`view.${view}`),
            group: t(`group.${group}`),
          })}
        >
          <Icon aria-hidden="true" />
          <ChevronDownIcon aria-hidden="true" className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t('view.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={view} onValueChange={(value) => onView(value as View)}>
          {views.map((value) => {
            const ViewIcon = viewIcons[value]
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ViewIcon aria-hidden="true" className="size-4 text-muted" />
                {t(`view.${value}`)}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('group.menu')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={group} onValueChange={(value) => onGroup(value as Grouping)}>
          {groupings.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(`group.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {view === 'wall' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('wallSize.label')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={wallSize}
              onValueChange={(value) => onWallSize(value as WallSize)}
            >
              {wallSizes.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`wallSize.${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}

        {view === 'shelf' && experimental ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('density.label')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={density}
              onValueChange={(value) => onDensity(value as Density)}
            >
              {densities.map((value) => {
                const DensityIcon = densityIcons[value]
                return (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <DensityIcon aria-hidden="true" className="size-4 text-muted" />
                    {t(`density.${value}`)}
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
