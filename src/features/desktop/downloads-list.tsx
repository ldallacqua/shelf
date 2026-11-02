'use client'

import {
  FileSearchIcon,
  FolderOpenIcon,
  PackageOpenIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/ui/button'
import { Confirm } from '@/ui/confirm'
import { Progress } from '@/ui/progress'

import { desktop } from './bridge'
import { type Download, downloads as commands } from './sources'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024
/** How often a page asks how far along it is, while something is moving. */
const LOOK_EVERY = 1000
/** What another go can't change: the same archive would say the same. */
const FINAL = ['password', 'unsafe']

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
  onExtract,
  onStopExtracting,
  onChoose,
  chosen,
}: {
  download: Download
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onShow: () => void
  onForget: () => void
  onExtract: () => void
  onStopExtracting: () => void
  onChoose: () => void
  /** The file just chosen for its game. */
  chosen?: string | undefined
}) {
  const t = useTranslations('Downloads')
  const format = useFormatter()
  const { state, done, total, speed, why, remote, archives, extraction, entry } = download
  const moving = state === 'downloading' || state === 'queued' || state === 'remote'
  const extracting = extraction?.state === 'waiting' || extraction?.state === 'working'
  const extracted = extraction?.state === 'done'
  const stuck = extraction?.state === 'failed' ? extraction.why : null
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
          {/* A set of files stands in a folder named for the title: no need to say it twice. */}
          {download.file && download.file !== download.title
            ? `${download.file} · ${download.sourceName}`
            : download.sourceName}
        </p>
      </div>
      {extracting ? (
        <div className="grid gap-2">
          {/* Until the archive has been read through, how much is in it isn't known. */}
          {extraction.total > 0 ? (
            <>
              <Progress
                value={extraction.done}
                max={extraction.total}
                aria-label={t('extractProgress', { title: download.title })}
              />
              <p className="text-sm">
                {`${t('extracting')} · ${t('sizeOf', {
                  done: size(format, extraction.done),
                  total: size(format, extraction.total),
                })}`}
              </p>
            </>
          ) : (
            <p className="text-sm">{t('reading')}</p>
          )}
        </div>
      ) : state === 'done' ? (
        <div className="grid gap-2">
          <p className="text-sm">
            {extracted
              ? t('extracted', { size: size(format, extraction.done) })
              : t('finished', { size: size(format, done) })}
          </p>
          {stuck ? (
            <p role="alert" className="text-sm text-pretty">
              {t(`extractWhy.${stuck}`)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2">
          {state === 'remote' ? (
            <Progress
              value={remote ?? 0}
              max={100}
              aria-label={t('progress', { title: download.title })}
            />
          ) : total !== null ? (
            <Progress
              value={done}
              max={total}
              aria-label={t('progress', { title: download.title })}
            />
          ) : null}
          <p className="text-sm">
            {state === 'remote' ? t('state.remote', { percent: remote ?? 0 }) : t(`state.${state}`)}
            {state !== 'remote' && (done > 0 || total !== null) ? ` · ${howFar}` : ''}
            {remaining ? <span className="text-muted">{` · ${remaining}`}</span> : null}
          </p>
          {state === 'failed' ? (
            <p role="alert" className="text-sm text-pretty">
              {t(`why.${why ?? 'unreachable'}`)}
            </p>
          ) : null}
        </div>
      )}
      {state === 'done' && !extracting ? (
        <p className="text-sm wrap-anywhere text-muted">{t('nothingRuns')}</p>
      ) : null}
      {chosen ? (
        <p role="status" className="text-sm wrap-anywhere">
          {t('chosen', { name: chosen })}
        </p>
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
        {extracting ? (
          <Confirm
            title={t('stopTitle', { title: download.title })}
            description={t('stopBody')}
            confirm={t('stopExtracting')}
            cancel={t('stopKeep')}
            onConfirm={onStopExtracting}
          >
            <Button size="sm" variant="ghost">
              <XIcon aria-hidden="true" />
              {t('stopExtracting')}
            </Button>
          </Confirm>
        ) : state === 'done' ? (
          <>
            {archives > 0 && extraction === null ? (
              <Button size="sm" variant="secondary" onClick={onExtract}>
                <PackageOpenIcon aria-hidden="true" />
                {t('extract')}
              </Button>
            ) : null}
            {stuck && !FINAL.includes(stuck) ? (
              <Button size="sm" variant="secondary" onClick={onExtract}>
                <RotateCwIcon aria-hidden="true" />
                {t('tryAgain')}
              </Button>
            ) : null}
            {entry !== null && (archives === 0 || extracted) ? (
              <Button size="sm" variant="secondary" onClick={onChoose}>
                <FileSearchIcon aria-hidden="true" />
                {t('chooseFile')}
              </Button>
            ) : null}
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
  onExtract,
  onStopExtracting,
  onChoose,
  chosen,
}: {
  list: readonly Download[]
  trouble?: string | undefined
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRemove: (id: string) => void
  onShow: (id: string) => void
  onExtract: (id: string) => void
  onStopExtracting: (id: string) => void
  onChoose: (download: Download) => void
  /** The file just chosen for a game, by the download it was chosen from. */
  chosen?: Readonly<Record<string, string>> | undefined
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
            onExtract={() => onExtract(download.id)}
            onStopExtracting={() => onStopExtracting(download.id)}
            onChoose={() => onChoose(download)}
            chosen={chosen?.[download.id]}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * What is being downloaded on this computer (ADR 007, spec 7.10). The app does the work with or
 * without this page, which only asks how far along it is, and only while something is moving and the
 * window can be seen. An archive is extracted when the person says, since it takes the time and the disk,
 * and the way on from there to Play is Windows' picker, as for any game.
 */
export function Downloads() {
  const t = useTranslations('Downloads')
  const [list, setList] = useState<Download[]>([])
  const [trouble, setTrouble] = useState<string>()
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({})

  const look = useCallback(async () => {
    if (document.hidden) return
    try {
      setList(await commands.list())
    } catch {
      setTrouble(t('errors.failed'))
    }
  }, [t])

  const moving = list.some(
    (each) =>
      ['downloading', 'queued', 'remote'].includes(each.state) ||
      each.extraction?.state === 'waiting' ||
      each.extraction?.state === 'working',
  )

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
      onExtract={(id) => void act(() => commands.extract(id))}
      onStopExtracting={(id) => void act(() => commands.stopExtracting(id))}
      onChoose={(download) =>
        void act(async () => {
          if (download.entry === null) return
          const file = await desktop.choose(
            download.entry,
            t('chooseTitle', { title: download.title }),
            t('chooseFiles'),
          )
          // Closed without a file: what was there stays.
          if (file) setChosen((now) => ({ ...now, [download.id]: file.name }))
        })
      }
      chosen={chosen}
    />
  )
}
