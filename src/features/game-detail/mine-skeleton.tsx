import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import type { LibraryGame, LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { formats, statuses } from '@/domain/library/values'
import { cn } from '@/ui/cn'
import { Textarea } from '@/ui/field'

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
 * date, the copies, whether a copy could still be added, and the tags.
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

  return (
    <section className="game-section" data-mine-skeleton="">
      <div className="flex items-baseline justify-between gap-3">
        <Level className="readout text-[0.6875rem] text-muted">{words('mine')}</Level>
      </div>
      <div aria-hidden="true" inert className="mt-3 grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">{words('status')}</legend>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className={label}>{t('played')}</span>
            <Ghost index={7} className={field} />
          </div>
          {game.status === 'completed' || game.completedOn ? (
            <div className="grid gap-1.5">
              <span className={label}>{t('completedOn')}</span>
              <Ghost index={8} className={field} />
            </div>
          ) : null}
        </div>

        {wishlist && choices.length > 0 ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t('wanted')}</legend>
            <div className="flex flex-wrap gap-2">
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
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{words('owned')}</legend>
            {game.copies.length === 0 ? (
              <p className="text-sm">{library('shelf.notOwned')}</p>
            ) : (
              <ul className="grid gap-2">
                {game.copies.map((copy, index) => (
                  <li
                    key={`${copy.platform}:${copy.format}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="min-w-28 flex-1 font-medium">
                      {platforms.get(copy.platform)?.name}
                    </span>
                    <Ghost
                      index={9 + index}
                      className="inline-flex w-fit items-center gap-0.5 rounded-control border border-transparent p-0.5"
                    >
                      {formats.map((format) => (
                        <span
                          key={format}
                          className="inline-flex h-9 min-w-9 items-center px-3 font-medium whitespace-nowrap pointer-coarse:h-10"
                        >
                          {library(`format.${format}`)}
                        </span>
                      ))}
                    </Ghost>
                    <span className="size-10 flex-none pointer-coarse:size-11" />
                  </li>
                ))}
              </ul>
            )}
            {addable ? (
              <div className="mt-1 flex flex-wrap items-end gap-2">
                <div className="grid min-w-44 flex-1 gap-1.5">
                  <span className={label}>{t('copyPlatform')}</span>
                  <Ghost index={10} className={field} />
                </div>
                <div className="grid min-w-32 gap-1.5">
                  <span className={label}>{t('copyFormat')}</span>
                  <Ghost
                    index={11}
                    className="flex h-10 items-center gap-2 rounded-control border border-transparent px-3 text-sm pointer-coarse:h-11"
                  >
                    {library('format.physical')}
                    <span className="size-4 flex-none" />
                  </Ghost>
                </div>
                <Ghost
                  index={12}
                  className="inline-flex h-10 items-center rounded-control border border-transparent px-4 text-sm font-medium whitespace-nowrap pointer-coarse:h-11"
                >
                  {t('addCopy')}
                </Ghost>
              </div>
            ) : null}
          </fieldset>
        )}

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

        <div className="grid justify-items-start gap-3 border-t border-line pt-4">
          <Ghost
            index={16}
            className="inline-flex h-10 items-center gap-2 rounded-control px-4 text-sm font-medium whitespace-nowrap pointer-coarse:h-11"
          >
            <span className="size-4 flex-none" />
            {t('remove')}
          </Ghost>
        </div>
      </div>
    </section>
  )
}
