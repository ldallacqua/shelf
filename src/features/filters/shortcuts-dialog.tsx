'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { Switch } from '@/ui/checkbox'
import { Sheet, SheetContent } from '@/ui/sheet'

import { setShortcutsOn, useShortcutsOn } from './shortcuts'

/** The keys, in the order the spec lists them (3.11). */
const KEYS = [
  ['arrows', '← →'],
  ['ledges', '↑ ↓'],
  ['shelves', 'Page Up · Page Down'],
  ['ends', 'Home · End'],
  ['open', 'Enter · Space'],
  ['close', 'Esc'],
  ['search', '/'],
  ['filters', 'F'],
  ['group', 'G'],
  ['sort', 'S'],
  ['view', 'V'],
  ['dimension', 'D'],
  ['adult', 'H'],
  ['shuffle', 'R'],
  ['add', 'A'],
  ['help', '?'],
] as const

/** `?`: every key the library answers to, and the switch that turns single letters off. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('Shortcuts')
  const on = useShortcutsOn()
  const switchId = useId()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('title')} description={t('description')} closeLabel={t('close')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
          {KEYS.map(([name, keys]) => (
            <div key={name} className="contents">
              <dt>
                <kbd className="rounded-[3px] border border-line-strong px-1.5 py-0.5 readout text-[0.6875rem] whitespace-nowrap">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-muted">{t(`keys.${name}`)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
          <Switch
            id={switchId}
            checked={on}
            onChange={(event) => setShortcutsOn(event.target.checked)}
          />
          <label htmlFor={switchId} className="text-sm">
            {t('letters')}
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">{t('lettersHint')}</p>
      </SheetContent>
    </Sheet>
  )
}
