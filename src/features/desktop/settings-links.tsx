'use client'

import { AppWindowIcon, CloudDownloadIcon, HardDriveDownloadIcon, LinkIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { AppPage } from '@/features/settings/pages'
import { PageGroup, PageRow, SideGroup, SideLink } from '@/features/settings/settings-links'

import { AppWords } from './app-words'

/**
 * Shelf for Windows' own settings pages (issue 152), in the side list and in the list of every
 * page: fetched only in the app, with the app's words (ADR 007, decision 4).
 */
const pages = [
  { key: 'app', href: '/settings/app', icon: AppWindowIcon },
  { key: 'download-sources', href: '/settings/download-sources', icon: LinkIcon },
  { key: 'download-services', href: '/settings/download-services', icon: CloudDownloadIcon },
  { key: 'saves', href: '/settings/saves', icon: HardDriveDownloadIcon },
] as const satisfies readonly { key: AppPage; href: string; icon: unknown }[]

function Side({ current }: { current?: AppPage }) {
  const t = useTranslations('AppSettings')
  return (
    <SideGroup title={t('group')}>
      {pages.map((page) => (
        <SideLink key={page.key} href={page.href} icon={page.icon} current={page.key === current}>
          {t(`pages.${page.key}.title`)}
        </SideLink>
      ))}
    </SideGroup>
  )
}

function Rows() {
  const t = useTranslations('AppSettings')
  return (
    <PageGroup id="settings-app" title={t('group')}>
      {pages.map((page) => (
        <PageRow
          key={page.key}
          href={page.href}
          icon={page.icon}
          title={t(`pages.${page.key}.title`)}
          description={t(`pages.${page.key}.description`)}
        />
      ))}
    </PageGroup>
  )
}

export function SideAppGroup({ current }: { current?: AppPage }) {
  return (
    <AppWords>
      <Side current={current} />
    </AppWords>
  )
}

export function RowsAppGroup() {
  return (
    <AppWords>
      <Rows />
    </AppWords>
  )
}
