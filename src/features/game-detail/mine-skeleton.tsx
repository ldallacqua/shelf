import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import type { LibraryGame, LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { formats, statuses } from '@/domain/library/values'
import { cn } from '@/ui/cn'
import { Textarea } from '@/ui/field'

import {
  mineCard,
  mineGroup,
  mineGroupRuled,
  mineGroups,
  mineHeading,
  mineTop,
} from './mine-layout'

type MineSkeletonProps = {
  game: LibraryGame
  /** The game's tags, by name. */
  tags: readonly LibraryTag[]
  platforms: ReadonlyMap<number, LibraryPlatform>
  level: 'h2' | 'h3'
}

/**
 * A ghost the size and shape of a control. Its words are there but not seen:
 * they give it the control's own width, so a row of them wraps where the
 * row of controls will.
 */
function Ghost({
  className,
  index,
  children,
}: {
  className: string
  index: number
  children?: ReactNode
}) {
  return (
    <span
      className={cn('ghost text-transparent', className)}
      style={{ '--i': index } as CSSProperties}
    >
      {children}
    </span>
  )
}

/**
 * "Mine" as the owner will edit it, while the editor is on its way: each
 * label where it will be and a ghost in each control's place, so nothing
 * below moves when the editor arrives. The editor (`mine-editor.tsx`) is
 * mirrored part for part, with the same classes; what decides its height is
 * known from the library file: the status, whether there is a completion
 * date, the copies, whether a copy could still be added, and the tags. Not
 * known there, and so drawn only by the editor: the line under the hours when
 * a store reports some, and the versions.
 */
export function MineSkeleton({ game, tags, platforms, level: Level }: MineSkeletonProps) {
  const t = useTranslations('Edit')
  const words = useTranslations('Game')
  const fields = useTranslations('Fields')
  const library = useTranslations('Library')

  const owned = new Set(game.copies.map((copy) => `${copy.platform}:${copy.format}`))
  const known = new Set([...game.platforms, ...game.copies.map((copy) => copy.platform)])
  // In the editor's order: the library's platforms are in shelf order already.
  const choices = [...platforms.values()].filter((platform) => known.has(platform.id))
  const addable = choices.some((platform) =>
    formats.some((format) => !owned.has(`${platform.id}:${format}`)),
  )
  const wishlist = game.status === 'wishlist'
  const label = 'text-sm font-medium'
  const field = 'block h-10 rounded-control pointer-coarse:h-11'
  const square = 'block size-10 flex-none rounded-control pointer-coarse:size-11'

  return (
    <section className="game-section" data-mine-skeleton="">
      <div className={mineTop}>
        <Level className="readout text-[0.6875rem] text-muted">{words('mine')}</Level>
      </div>
      <div aria-hidden="true" inert className={mineGroups}>
        <div className={mineGroup}>
          <fieldset className="grid gap-2">
            <legend className={cn(mineHeading, 'mb-2')}>{words('status')}</legend>
            <div className="flex flex-wrap gap-2">
              {statuses.map((each, index) => (
                <Ghost
                  key={each}
                  index={index}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-transparent px-3.5 text-sm pointer-coarse:min-h-11',
                    each === game.status && 'font-semibold',
                  )}
                >
                  {each === game.status ? <span className="-ml-0.5 size-4 flex-none" /> : null}
                  {library(`status.${each}`)}
                </Ghost>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <span className={label}>{fields('rating')}</span>
              <Ghost index={5} className="h-6 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 flex-1 items-center">
                <Ghost index={6} className="h-1.5 w-full rounded-full" />
              </span>
              <span className="size-8 flex-none pointer-coarse:size-10" />
            </div>
            <span className="-mt-2 h-2" />
            <span className="h-3" />
          </div>

          <div className="grid gap-1.5">
            <span className={label}>{t('played')}</span>
            <div className="flex max-w-64 items-center gap-2">
              <Ghost index={7} className={square} />
              <Ghost index={7} className={cn(field, 'min-w-0 flex-1')} />
              <Ghost index={7} className={square} />
            </div>
          </div>

          {game.status === 'completed' || game.completedOn ? (
            <div className="grid gap-1.5">
              <span className={label}>{t('completedOn')}</span>
              <Ghost index={8} className={field} />
            </div>
          ) : null}
        </div>

        {wishlist && choices.length > 0 ? (
          <fieldset className={mineGroupRuled}>
            <legend className={cn(mineHeading, 'float-left mb-2')}>{t('wanted')}</legend>
            <div className="clear-left flex flex-wrap gap-2">
              {choices.map((platform, index) => {
                const wanted = game.wanted?.includes(platform.id)
                return (
                  <Ghost
                    key={platform.id}
                    index={9 + index}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-transparent px-3.5 text-sm pointer-coarse:min-h-11',
                      wanted && 'font-semibold',
                    )}
                  >
                    {wanted ? <span className="-ml-0.5 size-4 flex-none" /> : null}
                    {platform.name}
                  </Ghost>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        {wishlist && game.copies.length === 0 ? null : (
          <fieldset className={mineGroupRuled}>
            <legend className={cn(mineHeading, 'float-left')}>{words('owned')}</legend>
            <div className="clear-left grid gap-2">
              {game.copies.length === 0 ? (
                <p className="text-sm">{t('noCopies')}</p>
              ) : (
                <ul className="grid gap-2">
                  {game.copies.map((copy, index) => (
                    <li key={`${copy.platform}:${copy.format}`} className={mineCard}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="pt-1 text-sm font-semibold">
                          {platforms.get(copy.platform)?.name}
                        </span>
                        <span className="-mt-1 -mr-1 size-10 flex-none pointer-coarse:size-11" />
                      </div>
                      <Ghost
                        index={9 + index}
                        className="grid w-full grid-cols-2 gap-0.5 rounded-control border border-transparent p-0.5"
                      >
                        <span className="h-9 pointer-coarse:h-10" />
                      </Ghost>
                    </li>
                  ))}
                </ul>
              )}
              {addable ? (
                <Ghost
                  index={12}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-control border border-transparent px-4 text-sm font-medium whitespace-nowrap pointer-coarse:h-11"
                >
                  <span className="size-4 flex-none" />
                  {t('addCopy')}
                </Ghost>
              ) : null}
            </div>
          </fieldset>
        )}

        <div className={mineGroupRuled}>
          <div className="grid gap-1.5">
            <span className={label}>{fields('tags')}</span>
            <Ghost
              index={13}
              className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border border-transparent p-1.5 pointer-coarse:min-h-11"
            >
              {tags.map((tag) => (
                <span
                  key={tag.slug}
                  className="inline-flex h-7 max-w-full items-center gap-0.5 pr-0.5 pl-2.5 text-sm"
                >
                  <span className="truncate">{tag.name}</span>
                  <span className="size-6 flex-none" />
                </span>
              ))}
              <span className="h-7 min-w-24 flex-1" />
            </Ghost>
            <p className="text-xs text-muted">{fields('tagsHint')}</p>
          </div>

          <div className="grid gap-2">
            <div className="grid gap-1.5">
              <span className={label}>{words('notes')}</span>
              {/* The editor's own box, so it takes the same four lines in every browser. */}
              <Textarea
                grow
                rows={4}
                readOnly
                tabIndex={-1}
                className="ghost border-transparent bg-text/8 read-only:opacity-100"
                style={{ '--i': 14 } as CSSProperties}
              />
            </div>
            <div className="flex min-h-10 items-center gap-3 text-sm">
              <Ghost index={15} className="h-6 w-10 flex-none rounded-full" />
              {t('notesPublic')}
            </div>
          </div>
        </div>

        <div className={mineGroupRuled}>
          <div className="flex items-start gap-3 text-sm">
            <Ghost index={16} className="mt-0.5 h-6 w-10 flex-none rounded-full" />
            <span className="grid gap-0.5">
              <span className="font-medium">{t('privateTitle')}</span>
              <span className="text-pretty text-muted">{t('privateHint')}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          {(['archive', 'remove'] as const).map((each, index) => (
            <Ghost
              key={each}
              index={17 + index}
              className="inline-flex h-10 items-center gap-2 rounded-control px-4 text-sm font-medium whitespace-nowrap pointer-coarse:h-11"
            >
              <span className="size-4 flex-none" />
              {t(each)}
            </Ghost>
          ))}
        </div>
      </div>
    </section>
  )
}
