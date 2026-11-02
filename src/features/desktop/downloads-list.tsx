'use client'

import { FolderOpenIcon, PauseIcon, PlayIcon, RotateCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/ui/button'
import { Confirm } from '@/ui/confirm'
import { Progress } from '@/ui/progress'

import { type Download, downloads as commands } from './sources'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024
/** How often a page asks how far along it is, while something is moving. */
const LOOK_EVERY = 1000

type Format = ReturnType<typeof useFormatter>

/** A size in the unit a person reads it in, with a decimal only where it says something. */
const size = (format: Format, bytes: number) => {
  const [value, unit] =
    bytes >= GB
      ? [bytes / GB, 'gigabyte']
      : bytes >= MB
        ? [bytes / MB, 'megabyte']
        : [bytes / KB, 'kilobyte']
  return format.number(value, {
    style: 'unit',
    unit,
    maximumFractionDigits: value < 100 ? 1 : 0,
  })
}

/** Time left, to the minute: a second-by-second count would only make it look exact. */
const left = (format: Format, seconds: number) => {
  const minutes = Math.ceil(seconds / 60)
  return minutes >= 60
    ? format.number(minutes / 60, { style: 'unit', unit: 'hour', maximumFractionDigits: 1 })
    : format.number(minutes, { style: 'unit', unit: 'minute' })
}

function DownloadCard({
  download,
  onPause,
  onResume,
  onCancel,
  onShow,
  onForget,
}: {
  download: Download
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onShow: () => void
  onForget: () => void
}) {
  const t = useTranslations('Downloads')
  const format = useFormatter()
  const { state, done, total, speed, why } = download
  const moving = state === 'downloading' || state === 'queued'
  const howFar =
    total !== null
      ? t('sizeOf', { done: size(format, done), total: size(format, total) })
      : size(format, done)
  const remaining =
    state === 'downloading' && speed > 0 && total !== null
      ? t('speedAndLeft', {
          speed: t('perSecond', { size: size(format, speed) }),
          left: left(format, (total - done) / speed),
        })
      : state === 'downloading' && speed > 0
        ? t('perSecond', { size: size(format, speed) })
        : undefined

  return (
    <article className="grid gap-4 rounded-panel border border-line bg-surface p-5">
      <div className="grid min-w-0 gap-1">
        <h3 className="title text-lg wrap-anywhere">{download.title}</h3>
        <p className="text-sm wrap-anywhere text-muted">
          {download.file ? `${download.file} · ${download.sourceName}` : download.sourceName}
        </p>
      </div>
      {state === 'done' ? (
        <p className="text-sm">{t('finished', { size: size(format, done) })}</p>
      ) : (
        <div className="grid gap-2">
          {total !== null ? (
            <Progress
              value={done}
              max={total}
              aria-label={t('progress', { title: download.title })}
            />
          ) : null}
          <p className="text-sm">
            {t(`state.${state}`)}
            {done > 0 || total !== null ? ` · ${howFar}` : ''}
            {remaining ? <span className="text-muted">{` · ${remaining}`}</span> : null}
          </p>
          {state === 'failed' ? (
            <p role="alert" className="text-sm text-pretty">
              {t(`why.${why ?? 'unreachable'}`)}
            </p>
          ) : null}
        </div>
      )}
      {state === 'done' ? (
        <p className="text-sm wrap-anywhere text-muted">{t('nothingRuns')}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {moving ? (
          <Button size="sm" variant="secondary" onClick={onPause}>
            <PauseIcon aria-hidden="true" />
            {t('pause')}
          </Button>
        ) : null}
        {state === 'paused' ? (
          <Button size="sm" variant="secondary" onClick={onResume}>
            <PlayIcon aria-hidden="true" />
            {t('resume')}
          </Button>
        ) : null}
        {state === 'failed' ? (
          <Button size="sm" variant="secondary" onClick={onResume}>
            <RotateCwIcon aria-hidden="true" />
            {t('tryAgain')}
          </Button>
        ) : null}
        {state === 'done' ? (
          <>
            <Button size="sm" variant="secondary" onClick={onShow}>
              <FolderOpenIcon aria-hidden="true" />
              {t('show')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onForget}>
              <XIcon aria-hidden="true" />
              {t('forget')}
            </Button>
          </>
        ) : (
          <Confirm
            title={t('cancelTitle', { title: download.title })}
            description={t('cancelBody')}
            confirm={t('cancelConfirm')}
            cancel={t('cancelKeep')}
            onConfirm={onCancel}
          >
            <Button size="sm" variant="ghost">
              <Trash2Icon aria-hidden="true" />
              {t('cancel')}
            </Button>
          </Confirm>
        )}
      </div>
    </article>
  )
}

/** The list, drawn from what it is given: every state of it, for Storybook too. */
export function DownloadsView({
  list,
  trouble,
  onPause,
  onResume,
  onRemove,
  onShow,
}: {
  list: readonly Download[]
  trouble?: string | undefined
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRemove: (id: string) => void
  onShow: (id: string) => void
}) {
  const t = useTranslations('Downloads')
  // Nothing is drawn for what may never come: most people here have downloaded nothing.
  if (list.length === 0 && !trouble) return null
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <h2 className="title text-xl sm:text-2xl">{t('title')}</h2>
      {trouble ? (
        <p
          role="alert"
          className="max-w-xl rounded-control border border-line-strong px-4 py-3 text-sm"
        >
          {trouble}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((download) => (
          <DownloadCard
            key={download.id}
            download={download}
            onPause={() => onPause(download.id)}
            onResume={() => onResume(download.id)}
            onCancel={() => onRemove(download.id)}
            onForget={() => onRemove(download.id)}
            onShow={() => onShow(download.id)}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * What is being downloaded on this computer (ADR 007, spec 7.10). The app does the work with or
 * without this page, which only asks how far along it is, and only while something is moving and the
 * window can be seen.
 */
export function Downloads() {
  const t = useTranslations('Downloads')
  const [list, setList] = useState<Download[]>([])
  const [trouble, setTrouble] = useState<string>()

  const look = useCallback(async () => {
    if (document.hidden) return
    try {
      setList(await commands.list())
    } catch {
      setTrouble(t('errors.failed'))
    }
  }, [t])

  const moving = list.some((each) => each.state === 'downloading' || each.state === 'queued')

  useEffect(() => {
    void Promise.resolve().then(look)
  }, [look])

  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => void look(), LOOK_EVERY)
    return () => clearInterval(timer)
  }, [moving, look])

  const act = async (work: () => Promise<void>) => {
    setTrouble(undefined)
    try {
      await work()
    } catch {
      setTrouble(t('errors.failed'))
    }
    await look()
  }

  return (
    <DownloadsView
      list={list}
      trouble={trouble}
      onPause={(id) => void act(() => commands.pause(id))}
      onResume={(id) => void act(() => commands.resume(id))}
      onRemove={(id) => void act(() => commands.remove(id))}
      onShow={(id) => void act(() => commands.show(id))}
    />
  )
}
