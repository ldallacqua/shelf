'use client'

import { DownloadIcon, FileUpIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Confirm } from '@/ui/confirm'
import { Input } from '@/ui/field'
import { Loading } from '@/ui/ghost'

import { AppWords } from './app-words'
import { SourceCardGhost } from './download-sources-ghost'
import { RealDebrid } from './real-debrid'
import { ThisComputer } from './this-computer'
import {
  type ReadingAll,
  type Source,
  type SourceRefusal,
  sourceRefusalOf,
  sources,
} from './sources'

/** How often a page asks how far along Read all is. */
const LOOK_EVERY = 1000

/** Said after an action, in the section it belongs to. */
export type SourcesSaid = { tone: 'done' | 'trouble'; text: string }

function SourceCard({
  source,
  reading,
  disabled,
  onReadAgain,
  onRemove,
}: {
  source: Source
  reading: boolean
  disabled: boolean
  onReadAgain: () => void
  onRemove: () => void
}) {
  const t = useTranslations('DownloadSources')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })

  return (
    <article className="grid gap-4 rounded-panel border border-line bg-surface p-5">
      <div className="grid min-w-0 gap-1">
        <h3 className="title text-lg wrap-anywhere">{source.name}</h3>
        <p className="text-sm wrap-anywhere text-muted">
          {source.file !== null ? t('fromFile', { name: source.file }) : source.url}
        </p>
      </div>
      <dl className="grid gap-1 text-sm">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="sr-only">{t('downloadsLabel')}</dt>
          <dd>{t('downloads', { count: source.items })}</dd>
          {source.items > 0 ? (
            <dd className="text-muted">
              {t('links', { magnets: source.magnets, web: source.web })}
            </dd>
          ) : null}
        </div>
        {source.leftOut > 0 ? (
          <div>
            <dt className="sr-only">{t('leftOutLabel')}</dt>
            <dd className="text-muted">{t('leftOut', { count: source.leftOut })}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t('readLabel')}</dt>
          <dd className="text-muted">
            {t('read', { when: format.relativeTime(new Date(source.readAt), now) })}
          </dd>
          {source.trouble ? (
            <dd className="mt-1 text-pretty">
              {t('lastReadFailed', { why: t(`errors.${source.trouble}`) })}
            </dd>
          ) : null}
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={onReadAgain}>
          <RefreshCwIcon aria-hidden="true" />
          {reading ? t('reading') : source.file !== null ? t('chooseAgain') : t('readAgain')}
        </Button>
        <Confirm
          title={t('removeTitle', { name: source.name })}
          description={t('removeBody')}
          confirm={t('removeConfirm')}
          cancel={t('removeCancel')}
          onConfirm={onRemove}
        >
          <Button size="sm" variant="ghost" disabled={disabled}>
            <Trash2Icon aria-hidden="true" />
            {t('remove')}
          </Button>
        </Confirm>
      </div>
    </article>
  )
}

/** The section, drawn from what it is given: every state of it, for Storybook too. */
export function DownloadSourcesView({
  list,
  address,
  adding = false,
  reading,
  said,
  invalid = false,
  readingAll,
  canReadAll = false,
  onReadAll = () => undefined,
  onAddress,
  onAdd,
  onAddFile,
  onReadAgain,
  onRemove,
}: {
  /** What this computer keeps; undefined while the app is asked. */
  list: readonly Source[] | undefined
  address: string
  adding?: boolean
  /** The source being read again. */
  reading?: string | undefined
  said?: SourcesSaid | undefined
  /** What was said is about the address in the field. */
  invalid?: boolean
  /** How far along Read all is, while it is going. */
  readingAll?: ReadingAll | undefined
  /** Whether this app can do it, and has an address to read. */
  canReadAll?: boolean
  onReadAll?: () => void
  onAddress: (address: string) => void
  onAdd: () => void
  onAddFile: () => void
  onReadAgain: (id: string) => void
  onRemove: (id: string) => void
}) {
  const t = useTranslations('DownloadSources')
  const warningId = useId()
  const saidId = useId()
  const busy = adding || reading !== undefined || readingAll !== undefined
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!busy && address.trim() !== '') onAdd()
  }

  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="title text-xl sm:text-2xl">{t('title')}</h2>
        <Button asChild size="sm" variant="ghost">
          <Link href="/downloads">
            <DownloadIcon aria-hidden="true" />
            {t('seeDownloads')}
          </Link>
        </Button>
      </div>
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      <form className="grid max-w-xl gap-3" onSubmit={submit}>
        <label className="grid gap-1.5 text-sm font-medium">
          {t('address')}
          <Input
            name="source"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('addressHint')}
            value={address}
            readOnly={adding}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${saidId} ${warningId}` : warningId}
            onChange={(event) => onAddress(event.target.value)}
            className="font-normal"
          />
        </label>
        <p id={warningId} className="text-sm text-pretty text-muted">
          {t('warning')}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" disabled={busy || address.trim() === ''}>
            <PlusIcon aria-hidden="true" />
            {adding ? t('adding') : t('add')}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onAddFile}>
            <FileUpIcon aria-hidden="true" />
            {t('addFile')}
          </Button>
        </div>
      </form>
      {said ? (
        <p
          id={saidId}
          role={said.tone === 'trouble' ? 'alert' : 'status'}
          className={
            said.tone === 'trouble'
              ? 'max-w-xl rounded-control border border-line-strong px-4 py-3 text-sm'
              : 'text-sm text-muted'
          }
        >
          {said.text}
        </p>
      ) : null}
      {list === undefined ? (
        <Loading label={t('loading')} className="contents">
          <SourceCardGhost />
        </Loading>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {canReadAll ? (
            <div className="grid gap-2 md:col-span-2">
              <div>
                <Button variant="secondary" disabled={busy} onClick={onReadAll}>
                  <RefreshCwIcon aria-hidden="true" />
                  {readingAll
                    ? t('readingAll', { done: readingAll.done + 1, total: readingAll.total })
                    : t('readAll')}
                </Button>
              </div>
              <p className="max-w-xl text-sm text-pretty text-muted">{t('readAllHelp')}</p>
            </div>
          ) : null}
          {list.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              reading={reading === source.id}
              disabled={busy}
              onReadAgain={() => onReadAgain(source.id)}
              onRemove={() => onRemove(source.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Download sources on this computer (ADR 007, spec 7.10), in Settings and in the app
 * alone: an address pasted, read and kept, read again, removed. Adding one downloads nothing, so it
 * asks nothing first; removing it can't be undone and does.
 */
function Sources() {
  const t = useTranslations('DownloadSources')
  const [list, setList] = useState<Source[]>()
  const [address, setAddress] = useState('')
  const [adding, setAdding] = useState(false)
  const [reading, setReading] = useState<string>()
  const [said, setSaid] = useState<SourcesSaid>()
  const [invalid, setInvalid] = useState(false)
  const [readingAll, setReadingAll] = useState<ReadingAll>()
  // An app too old for it says so by not answering: then the button isn't offered.
  const [canReadAll, setCanReadAll] = useState(false)

  const refused = (refusal: SourceRefusal) =>
    setSaid({ tone: 'trouble', text: t(`errors.${refusal}`) })
  // What the same refusal means of a file, which has no address to check.
  const refusedFile = (refusal: SourceRefusal) =>
    refusal === 'unsupported'
      ? setSaid({ tone: 'trouble', text: t('errors.fileUnsupported') })
      : refused(refusal)

  useEffect(() => {
    let current = true
    sources
      .list()
      .then((kept) => {
        if (current) setList(kept)
      })
      .catch(() => {
        if (!current) return
        setList([])
        setSaid({ tone: 'trouble', text: t('errors.failed') })
      })
    return () => {
      current = false
    }
  }, [t])

  const look = useCallback(async () => {
    const now = await sources.readingAll()
    setCanReadAll(true)
    setReadingAll(now ?? undefined)
    if (now) setList(await sources.list())
  }, [])

  // A page opened while one is going shows it too.
  useEffect(() => {
    void Promise.resolve()
      .then(look)
      .catch(() => setCanReadAll(false))
  }, [look])

  const going = readingAll !== undefined
  useEffect(() => {
    if (!going) return
    const timer = setInterval(() => void look().catch(() => undefined), LOOK_EVERY)
    return () => clearInterval(timer)
  }, [going, look])

  const readAll = async () => {
    setSaid(undefined)
    setInvalid(false)
    const count = list?.filter((each) => each.file === null).length ?? 0
    setReadingAll({ done: 0, total: count })
    try {
      const ended = await sources.readAll(t('windowTitle'))
      setSaid({
        tone: 'done',
        text: ended.stopped
          ? t('readAllStopped', { read: ended.read })
          : t('readAllDone', { read: ended.read, failed: ended.failed }),
      })
    } catch (error) {
      refused(sourceRefusalOf(error))
    }
    setReadingAll(undefined)
    setList(await sources.list().catch(() => list ?? []))
  }

  const add = async () => {
    setAdding(true)
    setSaid(undefined)
    setInvalid(false)
    try {
      const source = await sources.add(address, t('windowTitle'))
      setList((kept) => [...(kept ?? []), source])
      setAddress('')
      setSaid({
        tone: 'done',
        text: t('added', { name: source.name, count: source.items }),
      })
    } catch (error) {
      // The address stays in the field, to be corrected.
      refused(sourceRefusalOf(error))
      setInvalid(true)
    }
    setAdding(false)
  }

  const addFile = async () => {
    setAdding(true)
    setSaid(undefined)
    setInvalid(false)
    try {
      const source = await sources.addFile(t('fileTitle'), t('fileKinds'))
      // Closed without a file: nothing changes.
      if (source) {
        setList((kept) => [...(kept ?? []), source])
        setSaid({ tone: 'done', text: t('added', { name: source.name, count: source.items }) })
      }
    } catch (error) {
      refusedFile(sourceRefusalOf(error))
    }
    setAdding(false)
  }

  const chooseAgain = async (id: string) => {
    setReading(id)
    setSaid(undefined)
    setInvalid(false)
    try {
      const source = await sources.addFile(t('fileTitle'), t('fileKinds'), id)
      if (source) {
        setList((kept) => kept?.map((each) => (each.id === id ? source : each)))
        setSaid({ tone: 'done', text: t('readDone', { name: source.name, count: source.items }) })
      }
    } catch (error) {
      refusedFile(sourceRefusalOf(error))
    }
    setReading(undefined)
  }

  const readAgain = async (id: string) => {
    if (list?.find((each) => each.id === id)?.file != null) return chooseAgain(id)
    setReading(id)
    setSaid(undefined)
    setInvalid(false)
    try {
      const source = await sources.readAgain(id, t('windowTitle'))
      setList((kept) => kept?.map((each) => (each.id === id ? source : each)))
      setSaid({ tone: 'done', text: t('readDone', { name: source.name, count: source.items }) })
    } catch (error) {
      refused(sourceRefusalOf(error))
    }
    setReading(undefined)
  }

  const remove = async (id: string) => {
    setSaid(undefined)
    setInvalid(false)
    try {
      await sources.remove(id)
      setList((kept) => kept?.filter((each) => each.id !== id))
    } catch (error) {
      refused(sourceRefusalOf(error))
    }
  }

  return (
    <DownloadSourcesView
      list={list}
      address={address}
      adding={adding}
      reading={reading}
      said={said}
      invalid={invalid}
      readingAll={readingAll}
      canReadAll={canReadAll && (list ?? []).some((each) => each.file === null)}
      onReadAll={() => void readAll()}
      onAddress={(next) => {
        setAddress(next)
        setInvalid(false)
      }}
      onAdd={() => void add()}
      onAddFile={() => void addFile()}
      onReadAgain={(id) => void readAgain(id)}
      onRemove={(id) => void remove(id)}
    />
  )
}

/**
 * This computer's name, sources and Real-Debrid with their own words, which come with this code and not with the page
 * (`app-words.tsx`).
 */
export default function DownloadSources() {
  return (
    <AppWords>
      <div className="grid gap-10">
        <ThisComputer />
        <Sources />
        <RealDebrid />
      </div>
    </AppWords>
  )
}
