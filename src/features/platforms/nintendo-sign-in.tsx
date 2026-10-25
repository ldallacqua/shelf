'use client'

import { ExternalLinkIcon, LinkIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { MAX_PASTED_LINK, NINTENDO_REDIRECT } from '@/domain/sync/nintendo'
import type { NintendoLinkOutcome } from '@/domain/sync/link'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

import { CopyLinkPicture } from './copy-link-picture'
import { connectAddress, pasteNintendoLink } from './sync-client'

/**
 * Linking Nintendo (ADR 003, "Built: Nintendo"): Nintendo's page never sends
 * the browser back, so it takes three steps, each said in words: sign in on
 * Nintendo's page, in a tab of its own; copy the link of its "Select this
 * account" button instead of pressing it, which is also drawn, as no other
 * page asks for anything like it; paste it here. The same steps sign in
 * again when Nintendo has ended Shelf's session.
 */
export function NintendoSignIn({
  again = false,
  onLinked,
}: {
  /** Signing in again, for a link whose session Nintendo ended. */
  again?: boolean
  onLinked: () => void
}) {
  const t = useTranslations('Sync')
  const locale = useLocale()
  const id = useId()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Exclude<NintendoLinkOutcome, 'linked'> | 'failed'>()

  const send = async () => {
    if (link.trim() === '') return
    setBusy(true)
    setOutcome(undefined)
    const answer = await pasteNintendoLink(link)
    setBusy(false)
    if (!answer.ok) {
      setOutcome('failed')
      return
    }
    if (answer.value.outcome === 'linked') {
      setLink('')
      onLinked()
    } else setOutcome(answer.value.outcome)
  }

  return (
    <div className="grid gap-3">
      <p className="max-w-xl text-sm text-pretty">
        {again ? t('nintendo.again') : t('nintendo.how')}
      </p>
      <ol className="grid max-w-xl list-decimal gap-3 pl-5 text-sm text-pretty marker:text-muted">
        {/* A list item keeps its number only as a list item: what lays it out goes inside. */}
        <li>
          <div className="grid gap-2">
            <span>{t('nintendo.step1')}</span>
            <span>
              <Button asChild variant="primary">
                <a
                  href={connectAddress('nintendo', locale)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLinkIcon aria-hidden="true" />
                  {t('nintendo.signIn')}
                </a>
              </Button>
            </span>
          </div>
        </li>
        <li>
          <div className="grid gap-3">
            <span>{t('nintendo.step2')}</span>
            <CopyLinkPicture />
          </div>
        </li>
        <li>
          <div className="grid gap-2">
            <label htmlFor={`${id}-link`}>{t('nintendo.step3')}</label>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
            >
              <Input
                id={`${id}-link`}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                // The start of what the button links to: an address, the same in every language.
                placeholder={`${NINTENDO_REDIRECT}#…`}
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_PASTED_LINK}
                aria-describedby={outcome ? `${id}-outcome` : undefined}
                className="min-w-56 flex-1 font-mono text-xs"
              />
              <Button type="submit" variant="secondary" disabled={busy || link.trim() === ''}>
                <LinkIcon aria-hidden="true" />
                {busy ? t('nintendo.linking') : t('nintendo.link')}
              </Button>
            </form>
          </div>
        </li>
      </ol>
      {outcome ? (
        <p
          id={`${id}-outcome`}
          role="alert"
          className="max-w-xl rounded-control border border-line-strong px-4 py-3 text-sm text-pretty"
        >
          {outcome === 'failed' ? t('failed') : t(`nintendo.outcome.${outcome}`)}
        </p>
      ) : null}
    </div>
  )
}
