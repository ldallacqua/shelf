'use client'

import { DownloadIcon, SearchIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useState } from 'react'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'
import { GhostText, Loading } from '@/ui/ghost'
import { Sheet, SheetContent } from '@/ui/sheet'

import { AppWords } from './app-words'
import { type Found, downloads, sources } from './sources'

const when = (date: string | null) => {
  if (!date) return undefined
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** What a list says of one download, in the order a person chooses by. */
function FoundRow({
  found,
  state,
  onDownload,
}: {
  found: Found
  state: 'idle' | 'busy' | 'added'
  onDownload: () => void
}) {
  const t = useTranslations('FindDownload')
  const format = useFormatter()
  const date = when(found.uploadDate)
  const details = [
    found.fileSize,
    found.sourceName,
    date ? format.dateTime(date, { dateStyle: 'medium' }) : undefined,
  ].filter(Boolean)

  return (
    <li className="grid gap-2 border-t border-line py-4 first:border-t-0">
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm font-medium wrap-anywhere">{found.title}</p>
        <p className="text-xs wrap-anywhere text-muted">{details.join(' · ')}</p>
      </div>
      {found.web > 0 ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={state !== 'idle'}
            onClick={onDownload}
            aria-label={t(state === 'added' ? 'addedThis' : 'downloadThis', { title: found.title })}
          >
            <DownloadIcon aria-hidden="true" />
            {state === 'added' ? t('added') : t('download')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-pretty text-muted">
          {t(found.inParts ? 'onlyInParts' : 'onlyMagnet')}
        </p>
      )}
    </li>
  )
}

/** The sheet's insides, drawn from what they are given: every state of them, for Storybook too. */
export function FindDownloadView({
  words,
  results,
  said,
  busy,
  added,
  onWords,
  onSearch,
  onDownload,
}: {
  words: string
  /** What the words found; undefined while it is being looked for. */
  results: readonly Found[] | undefined
  said?: string | undefined
  /** The result being started. */
  busy?: string | undefined
  /** The results put in line. */
  added: ReadonlySet<string>
  onWords: (words: string) => void
  onSearch: () => void
  onDownload: (found: Found) => void
}) {
  const t = useTranslations('FindDownload')
  const key = (found: Found) => `${found.source}:${found.place}`
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch()
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-pretty text-muted">{t('warning')}</p>
      <form className="flex items-end gap-2" onSubmit={submit}>
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
          {t('words')}
          <Input
            name="words"
            value={words}
            autoComplete="off"
            onChange={(event) => onWords(event.target.value)}
            className="font-normal"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={words.trim() === ''}>
          <SearchIcon aria-hidden="true" />
          {t('search')}
        </Button>
      </form>
      {said ? (
        <p role="alert" className="rounded-control border border-line-strong px-4 py-3 text-sm">
          {said}
        </p>
      ) : null}
      {added.size > 0 ? (
        <p role="status" className="text-sm text-muted">
          {t.rich('addedSay', {
            link: (chunks) => (
              <Link
                href="/account"
                className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      {results === undefined ? (
        <Loading label={t('searching')} className="grid gap-5 py-4">
          {[0, 1, 2].map((row) => (
            <span key={row} className="grid gap-1">
              <GhostText order={row} className="w-4/5 text-sm" />
              <GhostText order={row} className="w-2/5 text-xs" />
            </span>
          ))}
        </Loading>
      ) : results.length === 0 ? (
        <p className="text-sm text-pretty text-muted">{t('nothing')}</p>
      ) : (
        <ul>
          {results.map((found) => (
            <FoundRow
              key={key(found)}
              found={found}
              state={busy === key(found) ? 'busy' : added.has(key(found)) ? 'added' : 'idle'}
              onDownload={() => onDownload(found)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function Finder({ title }: { title: string }) {
  const t = useTranslations('FindDownload')
  // Nothing is drawn for what may never come: with no source, there is nothing to find.
  const [hasSources, setHasSources] = useState(false)
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState(title)
  const [results, setResults] = useState<Found[]>()
  const [said, setSaid] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let current = true
    sources
      .list()
      .then((kept) => {
        if (current) setHasSources(kept.length > 0)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  const search = async (asked: string) => {
    setResults(undefined)
    setSaid(undefined)
    try {
      setResults(await sources.search(asked))
    } catch {
      setResults([])
      setSaid(t('errors.failed'))
    }
  }

  const download = async (found: Found) => {
    const key = `${found.source}:${found.place}`
    setBusy(key)
    setSaid(undefined)
    try {
      // False: the folder picker was closed, which changes nothing.
      if (await downloads.start(found, t('chooseFolder', { title: found.title }))) {
        setAdded((now) => new Set(now).add(key))
      }
    } catch (error) {
      const refusal = error === 'duplicate' || error === 'missing' ? error : 'failed'
      setSaid(t(`errors.${refusal}`))
    }
    setBusy(undefined)
  }

  if (!hasSources) return null
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void search(words)
      }}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(true)
          void search(words)
        }}
      >
        <DownloadIcon aria-hidden="true" />
        {t('open')}
      </Button>
      <SheetContent title={t('title', { title })} closeLabel={t('close')}>
        <FindDownloadView
          words={words}
          results={results}
          said={said}
          busy={busy}
          added={added}
          onWords={setWords}
          onSearch={() => void search(words)}
          onDownload={(found) => void download(found)}
        />
      </SheetContent>
    </Sheet>
  )
}

/**
 * Looking for a game in the sources on this computer (ADR 007, spec 7.10), from its page, in the app
 * alone. A list to read and choose from: nothing is matched or started by itself.
 */
export default function FindDownload({ title }: { title: string }) {
  return (
    <AppWords>
      <div data-play="">
        <Finder title={title} />
      </div>
    </AppWords>
  )
}
