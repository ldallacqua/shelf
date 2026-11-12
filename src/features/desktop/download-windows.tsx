import { MonitorDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { DOWNLOAD_WINDOWS } from '@/domain/desktop/release'
import { Button, type ButtonProps } from '@/ui/button'
import { cn } from '@/ui/cn'

/**
 * Downloads Shelf for Windows: the newest installer, through this site's address that always
 * names it (`DOWNLOAD_WINDOWS`). A plain link with no script, so it works on a page built ahead,
 * before anything has run. Its words say what happens: a download, for Windows.
 */
export function DownloadForWindows({
  variant = 'secondary',
  className,
}: {
  variant?: ButtonProps['variant']
  className?: string
}) {
  const t = useTranslations('Desktop')
  return (
    <Button variant={variant} asChild className={cn('h-12 px-5 text-base', className)}>
      <a href={DOWNLOAD_WINDOWS}>
        <MonitorDownIcon aria-hidden="true" />
        {t('download')}
      </a>
    </Button>
  )
}

/** What a download is: for which Windows, how big, and that it costs nothing and updates itself. */
export function DownloadFacts({ className }: { className?: string }) {
  const t = useTranslations('Desktop')
  return <p className={cn('text-sm text-muted', className)}>{t('facts')}</p>
}
