'use client'

import { CloudDownloadIcon, DownloadIcon, SearchIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { DropdownMenuItem } from '@/ui/dropdown-menu'
import { Input } from '@/ui/field'
import { GhostText, Loading } from '@/ui/ghost'

import { AppWords } from './app-words'
import { BesidePlay } from './beside-play'
import { type Download, type Found, downloads, realDebrid, sources } from './sources'

const linkClass =
  'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** A link to where Real-Debrid is signed in to, inside the words that say it is needed. */
const toSettings = (chunks: ReactNode) => (
  <Link href="/settings/download-services" className={linkClass}>
    {chunks}
  </Link>
)

/** A link to where what was put in line can be seen. */
const toDownloads = (chunks: ReactNode) => (
  <Link href="/downloads" className={linkClass}>
    {chunks}
  </Link>
)

const when = (date: string | null) => {
  if (!date) return undefined
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** What a list says of one download, in the order a person chooses by. */
function FoundRow({
  found,
  state,
  debrid,
  onDownload,
}: {
  found: Found
  state: 'idle' | 'busy' | 'added'
  /** Whether Real-Debrid is signed in on this computer. */
  debrid: boolean
  onDownload: (through: Download['through']) => void
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
      {state === 'added' ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled
            aria-label={t('addedThis', { title: found.title })}
          >
            <DownloadIcon aria-hidden="true" />
            {t('added')}
          </Button>
        </div>
      ) : found.web > 0 || debrid ? (
        <div className="flex flex-wrap gap-2">
          {debrid ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={state !== 'idle'}
              onClick={() => onDownload('realdebrid')}
              aria-label={t('throughThis', { title: found.title })}
            >
              <CloudDownloadIcon aria-hidden="true" />
              {t('through')}
            </Button>
          ) : null}
          {found.web > 0 ? (
            <Button
              size="sm"
              variant={debrid ? 'ghost' : 'secondary'}
              disabled={state !== 'idle'}
              onClick={() => onDownload('direct')}
              aria-label={t('downloadThis', { title: found.title })}
            >
              <DownloadIcon aria-hidden="true" />
              {t('download')}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-pretty text-muted">
          {t.rich(found.inParts ? 'needsDebridParts' : 'needsDebrid', { link: toSettings })}
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
  debrid = false,
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
  /** Whether Real-Debrid is signed in on this computer. */
  debrid?: boolean
  onWords: (words: string) => void
  onSearch: () => void
  onDownload: (found: Found, through: Download['through']) => void
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
          {t.rich('addedSay', { link: toDownloads })}
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
              debrid={debrid}
              onDownload={(through) => onDownload(found, through)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** What a search holds, for as long as it is open: reopened, it starts from the game's name again. */
function Finder({ title, entryId }: { title: string; entryId: string }) {
  const t = useTranslations('FindDownload')
  const [words, setWords] = useState(title)
  const [results, setResults] = useState<Found[]>()
  const [said, setSaid] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [debrid, setDebrid] = useState(false)

  const search = useCallback(
    async (asked: string) => {
      setResults(undefined)
      setSaid(undefined)
      try {
        setResults(await sources.search(asked))
      } catch {
        setResults([])
        setSaid(t('errors.failed'))
      }
    },
    [t],
  )

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => search(title))
    realDebrid
      .account()
      .then((account) => {
        if (current) setDebrid(account.state === 'in')
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [search, title])

  const download = async (found: Found, through: Download['through']) => {
    const key = `${found.source}:${found.place}`
    setBusy(key)
    setSaid(undefined)
    try {
      // False: the folder picker was closed, which changes nothing.
      if (
        await downloads.start(found, t('chooseFolder', { title: found.title }), through, entryId)
      ) {
        setAdded((now) => new Set(now).add(key))
      }
    } catch (error) {
      const refusal =
        error === 'duplicate' || error === 'missing' || error === 'signedout' ? error : 'failed'
      setSaid(t(`errors.${refusal}`))
    }
    setBusy(undefined)
  }

  return (
    <FindDownloadView
      words={words}
      results={results}
      said={said}
      busy={busy}
      added={added}
      debrid={debrid}
      onWords={setWords}
      onSearch={() => void search(words)}
      onDownload={(found, through) => void download(found, through)}
    />
  )
}

type FindDownloadProps = {
  title: string
  entryId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What it stands beside when it opens in place. */
  anchor: RefObject<HTMLElement | null>
}

/**
 * Looking for a game in the sources on this computer (ADR 007, spec 7.10), from its page, in the app
 * alone. A list to read and choose from: nothing is matched or started by itself. A sheet, as anything
 * opened from a game is; but where the game stands in the middle of a very wide window, a sheet would be a
 * second frame at the far edge of the screen, so it opens beside the button, over the game and not apart.
 */
export default function FindDownload({
  title,
  entryId,
  open,
  onOpenChange,
  anchor,
}: FindDownloadProps) {
  return (
    <AppWords>
      <Frame title={title} open={open} onOpenChange={onOpenChange} anchor={anchor}>
        <Finder title={title} entryId={entryId} />
      </Frame>
    </AppWords>
  )
}

function Frame({
  title,
  open,
  onOpenChange,
  anchor,
  children,
}: Omit<FindDownloadProps, 'entryId'> & { children: ReactNode }) {
  const t = useTranslations('FindDownload')
  return (
    <BesidePlay
      heading={t('title', { title })}
      closeLabel={t('close')}
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
    >
      {children}
    </BesidePlay>
  )
}

/** Its place in Play's menu, with its own words, which come with this code and not with the page. */
export function FindDownloadItem({ onOpen }: { onOpen: () => void }) {
  return (
    <AppWords>
      <ItemWords onOpen={onOpen} />
    </AppWords>
  )
}

function ItemWords({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('FindDownload')
  return (
    <DropdownMenuItem onSelect={onOpen}>
      <DownloadIcon aria-hidden="true" />
      {t('open')}
    </DropdownMenuItem>
  )
}
