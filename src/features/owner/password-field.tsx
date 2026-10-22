'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, type Ref, useId, useState } from 'react'

import { Input } from '@/ui/field'

type PasswordFieldProps = {
  label: string
  name: string
  /** `current-password` to sign in, `new-password` to choose one. */
  autoComplete: 'current-password' | 'new-password'
  disabled?: boolean
  minLength?: number
  maxLength?: number
  inputRef?: Ref<HTMLInputElement>
  /** Said under the field, and read with it. */
  hint?: ReactNode
}

/** A password, with a button that shows it as text while pressed. */
export function PasswordField({
  label,
  name,
  autoComplete,
  disabled,
  minLength,
  maxLength,
  inputRef,
  hint,
}: PasswordFieldProps) {
  const t = useTranslations('Account')
  const [shown, setShown] = useState(false)
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          spellCheck={false}
          disabled={disabled}
          minLength={minLength}
          maxLength={maxLength}
          aria-describedby={hint ? hintId : undefined}
          className="pr-12 font-normal"
        />
        {/* Pressed, the password shows as text; its name stays the same either way. */}
        <button
          type="button"
          aria-pressed={shown}
          aria-label={t('showPassword')}
          disabled={disabled}
          onClick={() => setShown((was) => !was)}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-muted transition-colors duration-quick ease-settle hover:text-text disabled:opacity-50"
        >
          {shown ? (
            <EyeOffIcon aria-hidden="true" className="size-4" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
