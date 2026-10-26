import { MinusIcon, SquareIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/ui/cn'
import { WindowRestoreIcon } from '@/ui/icons'

const caption =
  'grid h-full w-11.5 place-items-center text-text focus-visible:-outline-offset-2 [&_svg]:size-4'
const quiet = 'hover:bg-text/10 active:bg-text/15'

/**
 * Minimize, maximize (or restore) and close, at the header's right end, as
 * Windows draws them (ADR 005, section 8). Drawn on the server for every
 * page and shown by CSS only in Shelf for Windows' window without a bar, so
 * they are there from its first paint. What they do is fetched only in that
 * window (`frame.ts`), which reads `data-window-command`.
 */
export function WindowControls() {
  const t = useTranslations('Shell.window')

  return (
    <div className="absolute inset-y-0 right-0 hidden frameless:flex">
      <button
        type="button"
        data-window-command="minimize"
        aria-label={t('minimize')}
        title={t('minimize')}
        className={cn(caption, quiet)}
      >
        <MinusIcon aria-hidden="true" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        data-window-command="toggle_maximize"
        // The label follows the window: `frame.ts` swaps these two in when it maximizes.
        data-label-maximize={t('maximize')}
        data-label-restore={t('restore')}
        aria-label={t('maximize')}
        title={t('maximize')}
        className={cn(caption, quiet)}
      >
        <SquareIcon aria-hidden="true" strokeWidth={1.5} className="maximized:hidden" />
        <WindowRestoreIcon
          aria-hidden="true"
          strokeWidth={1.5}
          className="hidden maximized:block"
        />
      </button>
      <button
        type="button"
        data-window-command="close"
        aria-label={t('close')}
        title={t('close')}
        className={cn(
          caption,
          'hover:bg-window-close hover:text-on-window-close active:bg-window-close/90 active:text-on-window-close',
        )}
      >
        <XIcon aria-hidden="true" strokeWidth={1.5} />
      </button>
    </div>
  )
}
