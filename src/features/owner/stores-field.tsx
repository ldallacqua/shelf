'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { cleanStores, pcStores, storeChoices } from '@/domain/library/store-choices'
import type { StoreName } from '@/domain/library/stores'
import { ChoiceChip, ToggleChip } from '@/ui/chip'

/**
 * Which stores a download on a PC is from, or would be bought from: first what
 * it is sold on, then, asked for, the rest, for what IGDB does not know. Any
 * number of them, since I can have a game on two.
 */
export function StoresField({
  soldOn = [],
  value,
  onChange,
}: {
  /** What it is known to be sold on. */
  soldOn?: readonly StoreName[]
  value: readonly StoreName[]
  onChange: (stores: StoreName[]) => void
}) {
  const t = useTranslations('Stores')
  const library = useTranslations('Library')
  // A store I had stays where it stood when unticked.
  const [had] = useState(value)
  const { offered, rest } = storeChoices(soldOn, [...had, ...value])
  const [more, setMore] = useState(false)
  const firstOfRest = useRef<HTMLInputElement>(null)

  // Its button gone, the focus goes to what it opened.
  useEffect(() => {
    if (more) firstOfRest.current?.focus()
  }, [more])

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{t('which')}</legend>
      <div className="flex flex-wrap gap-2">
        {(more ? pcStores : offered).map((store) => (
          <ChoiceChip
            key={store}
            ref={store === rest[0] ? firstOfRest : undefined}
            type="checkbox"
            checked={value.includes(store)}
            onChange={(event) =>
              onChange(
                cleanStores(
                  event.target.checked ? [...value, store] : value.filter((each) => each !== store),
                ),
              )
            }
          >
            {library(`store.${store}`)}
          </ChoiceChip>
        ))}
        {!more && rest.length > 0 ? (
          <ToggleChip
            pressed={false}
            onClick={() => setMore(true)}
            className="border-dashed text-muted hover:text-text"
          >
            <PlusIcon aria-hidden="true" className="-ml-0.5 size-4" />
            {t('other')}
          </ToggleChip>
        ) : null}
      </div>
    </fieldset>
  )
}
