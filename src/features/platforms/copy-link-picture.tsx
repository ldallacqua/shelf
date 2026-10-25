import { CopyIcon, MousePointer2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Linking Nintendo's second step, drawn: its "Select this account" button,
 * not pressed, with the menu a right-click (or a long press) opens on it and
 * "Copy link address" picked. Shelf's own drawing, in the page's colors: not
 * a picture of Nintendo's page, and none of its marks, which its owner allows
 * no one. The menu's other choices are bars, as every browser words them
 * differently. Hidden from assistive technology: the step's words say all of
 * it.
 */
export function CopyLinkPicture() {
  const t = useTranslations('Sync')
  return (
    <div
      aria-hidden="true"
      className="w-fit max-w-full rounded-panel border border-line bg-wall p-4 pb-5 select-none"
    >
      <div className="relative w-fit">
        <span className="inline-flex h-10 items-center rounded-full bg-accent px-5 pb-1 text-sm font-medium text-on-accent">
          {t('nintendo.picture.button')}
        </span>
        {/* On the button's lower edge, under its words, where the menu opens: its tip at the menu's corner. */}
        <MousePointer2Icon className="absolute top-6 left-10 z-20 size-5 fill-surface-raised text-text" />
      </div>
      <div className="relative z-10 -mt-3 ml-11 w-fit rounded-control border border-line-strong bg-surface-raised py-1 text-sm text-text shadow-panel">
        <span className="flex h-7 items-center px-3">
          <span className="h-1.5 w-20 rounded-full bg-line" />
        </span>
        <span className="flex min-h-7 items-center gap-2 bg-accent px-3 py-1 text-on-accent">
          <CopyIcon className="size-3.5 shrink-0" />
          {t('nintendo.picture.copy')}
        </span>
        <span className="flex h-7 items-center px-3">
          <span className="h-1.5 w-16 rounded-full bg-line" />
        </span>
      </div>
    </div>
  )
}
