import { useTranslations } from 'next-intl'

import { presetNames } from '@/domain/colorway/names'
import { ChoiceChip } from '@/ui/chip'
import { Ledge } from '@/ui/ledge'

import { DemoCase, type CaseGame } from './demo-case'

/** A case in a room is about this wide. */
const ROOM_SIZES = '48px'

/** Which colorway the rooms open in: one that is not the page's own, so the change shows at once. */
export const FIRST_LOOK = 'ocean' satisfies (typeof presetNames)[number]

/**
 * "Paint the room your way" (spec 9): the example shelf in each colorway, with the lights off and
 * on, side by side. A row of chips chooses the colorway. The chips are the browser's own radio
 * buttons and the rooms are drawn for every colorway on the server, each inside `data-colors`;
 * landing.css shows the room of the chip that is checked. So it works with no script at all, and
 * adds none to the page.
 */
export function LookDemo({ games }: { games: readonly CaseGame[] }) {
  const t = useTranslations('Landing.look')
  const names = useTranslations('Settings.colors.presets')
  return (
    <div className="look-demo grid gap-5">
      <fieldset className="min-w-0">
        <legend className="sr-only">{t('choose')}</legend>
        <div className="flex flex-wrap gap-2">
          {presetNames.map((name) => (
            <ChoiceChip
              key={name}
              type="radio"
              name="landing-colorway"
              value={name}
              defaultChecked={name === FIRST_LOOK}
              className="min-h-9 px-3 text-[0.8125rem]"
            >
              <span
                aria-hidden="true"
                data-colors={name}
                className="block size-3 rounded-full bg-accent shadow-[0_0_6px_var(--led)]"
              />
              {names(`${name}.name`)}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>
      <div className="look-stages">
        {presetNames.map((name) => (
          <div
            key={name}
            role="img"
            aria-label={t('rooms', { name: names(`${name}.name`) })}
            data-stage={name}
            // Shelf's own too: the visitor's device may be in another colorway.
            data-colors={name}
            className="look-stage grid-cols-2 gap-3"
          >
            {(['dark', 'light'] as const).map((theme) => (
              <div key={theme} className="grid min-w-0 gap-2">
                <div
                  data-theme={theme}
                  className="look-room overflow-hidden rounded-panel border border-line bg-wall px-3 pt-3"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="block size-3 rounded-[3px] bg-text/80" />
                    <span className="block h-1.5 w-8 rounded-full bg-muted/70" />
                    <span className="ml-auto block h-4 w-10 rounded-[4px] bg-accent" />
                  </span>
                  <span className="mt-2 block h-1.5 w-16 rounded-full bg-text/60" />
                  <Ledge className="mt-3" itemsClassName="look-bay flex-nowrap justify-center">
                    {games.map((game) => (
                      <DemoCase key={game.title} game={game} sizes={ROOM_SIZES} />
                    ))}
                  </Ledge>
                </div>
                <p aria-hidden="true" className="text-xs text-muted">
                  {t(theme === 'dark' ? 'off' : 'on')}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
