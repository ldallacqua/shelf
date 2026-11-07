import { MonitorSmartphoneIcon, UserRoundIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type ScopeOf = 'account' | 'device'

/**
 * Whose a setting is (issue 152): the account's, the same wherever I sign in, or this device's
 * alone. Said the same small way beside every setting's title, so the body text doesn't have to.
 */
export function Scope({ of }: { of: ScopeOf }) {
  const t = useTranslations('Settings.scope')
  const Icon = of === 'account' ? UserRoundIcon : MonitorSmartphoneIcon
  return (
    <span className="inline-flex items-center gap-1.5 readout text-[0.6875rem] whitespace-nowrap text-muted uppercase">
      <Icon aria-hidden="true" className="size-3.5" />
      {t(of)}
    </span>
  )
}
