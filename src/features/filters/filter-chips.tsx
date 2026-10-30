'use client'

import { XIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { LibraryIndex } from '@/domain/query/evaluate'
import { chipsOf, type Chip } from '@/domain/query/panel'
import type { Problem, QueryNode } from '@/domain/query/tree'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Tip } from '@/ui/tooltip'

import { conditionLabel } from './labels'

type FilterChipsProps = {
  tree: QueryNode | undefined
  problems: readonly Problem[]
  index: LibraryIndex | undefined
  onRemove: (chip: Chip) => void
  onRemoveProblem: (problem: Problem) => void
  onClear: () => void
  className?: string
}

const chipClass = cn(
  'inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-line-strong bg-surface pr-1 pl-3 text-sm',
  'pointer-coarse:h-10',
)

const removeClass = cn(
  'inline-flex size-6 flex-none items-center justify-center rounded-full text-muted',
  'transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text',
  'pointer-coarse:size-8',
)

/**
 * One chip per condition, each removable, and Clear all (spec 3.1). The
 * groups of an OR are shown with "or" between them. What could not be
 * understood is a chip of its own, struck through, saying it was ignored.
 */
export function FilterChips({
  tree,
  problems,
  index,
  onRemove,
  onRemoveProblem,
  onClear,
  className,
}: FilterChipsProps) {
  const t = useTranslations('Filters')
  const library = useTranslations('Library')
  const format = useFormatter()
  const words = { t, library, format }
  const groups = chipsOf(tree)
  if (groups.length === 0 && problems.length === 0) return null

  return (
    <div
      role="group"
      aria-label={t('chips.label')}
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}
    >
      {groups.map((chips, group) => (
        <span key={group} className="contents">
          {group > 0 ? (
            <span className="px-1 readout text-[0.625rem] text-muted uppercase">
              {t('chips.or')}
            </span>
          ) : null}
          {chips.map((chip) => {
            const label = conditionLabel(chip.node, index, words)
            return (
              <span key={`${group}:${chip.index}`} className={chipClass} data-slot="filter-chip">
                <span className="truncate">{label}</span>
                <Tip label={t('chips.remove', { condition: label })}>
                  <button
                    type="button"
                    aria-label={t('chips.remove', { condition: label })}
                    onClick={() => onRemove(chip)}
                    className={removeClass}
                  >
                    <XIcon aria-hidden="true" className="size-3.5" />
                  </button>
                </Tip>
              </span>
            )
          })}
        </span>
      ))}
      {problems.map((problem) => (
        <span
          key={`${problem.from}:${problem.text}`}
          className={cn(chipClass, 'border-dashed text-muted')}
          data-slot="filter-chip"
          data-ignored=""
        >
          <span className="sr-only">{t('chips.ignored')}</span>
          <s className="truncate">{problem.text}</s>
          {/* Why it was left out, which the chip shows only by its dashes. */}
          <Tip label={t('chips.ignoredTip', { reason: t(`problems.${problem.reason}`) })} describes>
            <button
              type="button"
              aria-label={t('chips.remove', { condition: problem.text })}
              onClick={() => onRemoveProblem(problem)}
              className={removeClass}
            >
              <XIcon aria-hidden="true" className="size-3.5" />
            </button>
          </Tip>
        </span>
      ))}
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t('chips.clear')}
      </Button>
    </div>
  )
}
