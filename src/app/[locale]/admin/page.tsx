import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

import { AdminDashboard } from '@/features/admin/admin-dashboard'
import { AdminWords } from '@/features/admin/admin-words'
import en from '@messages/admin/en.json'
import ptBR from '@messages/admin/pt-BR.json'

export async function generateMetadata(): Promise<Metadata> {
  const words = (await getLocale()) === 'pt-BR' ? ptBR : en
  return { title: words.Admin.metaTitle, robots: { index: false, follow: false } }
}

/**
 * Jobs started by hand, on the server, for whoever has the admin password. Built ahead as its
 * ghosts, the same for everyone: the browser asks the server whether it may open it.
 */
export default function AdminPage() {
  return (
    <AdminWords>
      <AdminDashboard />
    </AdminWords>
  )
}
