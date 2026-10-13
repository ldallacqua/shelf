import { useTranslations } from 'next-intl'

// Each role and the token that carries it.
const roles = [
  { key: 'wall', token: '--wall' },
  { key: 'surface', token: '--surface' },
  { key: 'shelf', token: '--ledge' },
  { key: 'text', token: '--text' },
  { key: 'muted', token: '--text-muted' },
  { key: 'accent', token: '--accent' },
  { key: 'marker', token: '--marker' },
  { key: 'led', token: '--led' },
] as const

/** The color roles. Each swatch shows the value with the lights on and with them off. */
export function ColorRoles() {
  const t = useTranslations('Foundations.color.roles')

  return (
    <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {roles.map((role) => (
        <li key={role.key} className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-20 shrink-0 overflow-hidden rounded-control border border-line-strong"
          >
            <span
              data-theme="light"
              className="flex-1"
              style={{ backgroundColor: `var(${role.token})` }}
            />
            <span
              data-theme="dark"
              className="flex-1"
              style={{ backgroundColor: `var(${role.token})` }}
            />
          </span>
          <span>
            <span className="block font-medium">{t(`${role.key}.name`)}</span>
            <span className="block text-sm text-muted">{t(`${role.key}.use`)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
