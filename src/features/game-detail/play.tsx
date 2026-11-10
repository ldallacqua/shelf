'use client'

import { EllipsisIcon, PlayIcon, RefreshCwIcon, SquareIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { SteamApps } from '@/domain/library/editing'
import { steamInstallLink, steamPlayLink } from '@/domain/sync/steam'
import type { BeforePlaySaid } from '@/features/desktop/before-play'
import {
  desktop,
  inDesktopApp,
  refusalOf,
  type GameView,
  type Launcher,
} from '@/features/desktop/bridge'
import {
  FindDownloadItem,
  FindDownloadLater,
  useHasSources,
} from '@/features/desktop/find-download-later'
import {
  SavesItem,
  SavesLater,
  SavesStatusLater,
  useSavesAvailable,
} from '@/features/desktop/saves-later'
import { notify } from '@/features/shell/notices'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Confirm } from '@/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tip } from '@/ui/tooltip'

import { minePlay } from './mine-layout'
import { useGameState } from './use-game-state'

/**
 * A button that can't be pressed now, and says why. Not `disabled`, which would throw keyboard
 * focus off the page the moment Play turns to Starting, and hide it from a tip.
 */
const waiting = 'cursor-default opacity-60 hover:shadow-none motion-safe:active:translate-y-0'

/** How far a game's saves' sync has got, as a whole percent, where the app can tell. */
const shareOf = (syncing: GameView['syncing']) =>
  syncing?.total
    ? Math.min(100, Math.floor(((syncing.done ?? 0) / syncing.total) * 100))
    : undefined

type PlayProps = {
  entryId: string
  title: string
  steam?: SteamApps
}

/**
 * Play, on my own game (spec 7.7). In Shelf for Windows it starts the game:
 * from the file chosen for it, or through Steam, and turns to Stop while the
 * app can show the game is running. In a browser, which cannot start a file
 * nor see what is running, it is what a browser can do: open Steam on a game
 * the Steam sync found I own, and not on a phone.
 */
export function Play(props: PlayProps) {
  // Known only once the page runs: the server draws every page as a browser's.
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  return app ? <PlayInApp {...props} /> : <PlayOnSteam steam={props.steam} />
}

/** Being inside the app never changes while a page is open. */
const unchanging = () => () => {}

function PlayOnSteam({ steam }: { steam?: SteamApps }) {
  const t = useTranslations('Edit')
  const link = steam?.owned ? steamPlayLink(steam.owned) : undefined
  if (!link) return null
  return (
    <div className={cn(minePlay, 'pointer-coarse:hidden')}>
      <Button asChild variant="primary">
        <a href={link} data-play="">
          <PlayIcon aria-hidden="true" />
          {t('playOnSteam')}
        </a>
      </Button>
    </div>
  )
}

/** What this computer has for the game: its file, and its Steam apps installed here. */
type Here = { launcher: Launcher | null; installed: readonly string[] }

const noApps: readonly string[] = []

function PlayInApp({ entryId, title, steam }: PlayProps) {
  const t = useTranslations('Edit')
  const locale = useLocale()
  const [here, setHere] = useState<Here>()
  const [busy, setBusy] = useState(false)
  // Play pressed and not answered yet: the game's saves may be looked at first (ADR 008, section 7).
  const [playing, setPlaying] = useState(false)
  const hasSources = useHasSources()
  const [finding, setFinding] = useState(false)
  // Fetched only once it is asked for, and kept from then on, for the dialog to leave as it came.
  const [asked, setAsked] = useState(false)
  const keepsSaves = useSavesAvailable()
  const [saving, setSaving] = useState(false)
  const [savesAsked, setSavesAsked] = useState(false)
  // Saves opened by Play, as two copies differ: keeping one, or deciding later, plays.
  const [choosing, setChoosing] = useState(false)
  const around = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement>(null)
  // The status beside Play, when it opened Saves; otherwise the menu's button, as the item has gone.
  const opener = useRef<HTMLElement | null>(null)
  const back = () =>
    (opener.current?.isConnected ? opener.current : more.current) ??
    around.current?.querySelector('button')
  const installedApps = here?.installed ?? noApps
  const { state, check, sentGameToSteam } = useGameState(
    entryId,
    installedApps,
    here?.launcher?.path,
    here !== undefined,
    playing,
  )
  const view = typeof state === 'object' ? state : undefined

  // Said aloud when it changes by itself, as it does when the game is closed from the game.
  const [spoken, setSpoken] = useState('')
  const [heard, setHeard] = useState(view?.state)
  if (heard !== view?.state) {
    setHeard(view?.state)
    if (view?.state === 'running') setSpoken(t('gameRunning', { title }))
    else if (view?.state === 'stopped' && heard !== undefined && heard !== 'starting')
      setSpoken(t('gameClosed', { title }))
  }
  const unresponsive = view?.unresponsive === true
  const wasUnresponsive = useRef(false)
  useEffect(() => {
    if (unresponsive && !wasUnresponsive.current) {
      notify({ message: t('stopNoAnswer', { title }) })
    }
    wasUnresponsive.current = unresponsive
  }, [unresponsive, t, title])

  // The record is read again after every change; what this computer has is asked once a game.
  const known = steam?.known.join(' ') ?? ''
  useEffect(() => {
    let current = true
    const apps = known === '' ? [] : known.split(' ')
    void Promise.all([
      desktop.launcher(entryId).catch(() => null),
      apps.length > 0 ? desktop.steamInstalled(apps).catch(() => []) : [],
    ]).then(([launcher, installed]) => {
      if (current) setHere({ launcher, installed })
    })
    return () => {
      current = false
    }
  }, [entryId, known])

  // Nothing until both are known, so Play never shows for a moment on a game that is running: only
  // its line, kept from the start as the skeleton keeps it.
  if (!here || state === undefined) return <div className={minePlay} />

  const { launcher, installed } = here

  const failed = (error: unknown, name = launcher?.name ?? title) => {
    const refusal = refusalOf(error)
    if (refusal === 'missing') {
      setHere({ launcher: launcher ? { ...launcher, exists: false } : null, installed })
      notify({ message: t('fileGone', { name }) })
    } else if (refusal === 'refused') notify({ message: t('playRefused', { name }) })
    else notify({ message: t('playFailed') })
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const choose = () =>
    run(async () => {
      const chosen = await desktop
        .choose(entryId, t('chooseTitle', { title }), t('chooseFiles'))
        .catch((error: unknown) => {
          failed(error)
          return undefined
        })
      // Closed without a file: what was there stays.
      if (chosen) setHere({ launcher: chosen, installed })
    })

  const openSaves = (beforePlay: boolean, from: HTMLElement | null = null) => {
    opener.current = from
    setChoosing(beforePlay)
    setSavesAsked(true)
    setSaving(true)
  }

  // In the app's own words, fetched only when there is something to say.
  const say = async (said: BeforePlaySaid) => {
    const { beforePlayNotice } = await import('@/features/desktop/before-play')
    const { message, open } = beforePlayNotice(locale, title, said)
    notify({ message, actions: [{ label: open, run: () => openSaves(false) }] })
  }

  /** `look`: whether the game's saves are looked at first; not when the person chose what is here. */
  const play = (look = true) =>
    run(async () => {
      setPlaying(true)
      try {
        const played = await desktop.play(entryId, look)
        if (!played.started) {
          // Two copies of its saves differ: the person chooses before it starts.
          openSaves(true)
          return
        }
        const saves = played.saves
        // Started with what is here: said, with the way to the game's saves.
        if (saves?.did === 'unreachable' || saves?.did === 'failed') void say(saves)
        // An app that can't tell has no Starting to show: it says so once.
        else if (state === 'unavailable') notify({ message: t('starting', { title }) })
        check()
      } catch (error) {
        if (refusalOf(error) === 'busy') void say('busy')
        else failed(error)
      } finally {
        setPlaying(false)
      }
    })

  const stopFailed = (error: unknown) =>
    notify({
      message: refusalOf(error) === 'refused' ? t('stopRefused', { title }) : t('playFailed'),
    })

  const stop = () =>
    run(async () => {
      try {
        await desktop.stopGame(entryId, installed)
      } catch (error) {
        stopFailed(error)
      }
      check()
    })

  const forceStop = () =>
    run(async () => {
      try {
        await desktop.forceStopGame(entryId, installed)
      } catch (error) {
        stopFailed(error)
      }
      check()
    })

  const forget = () =>
    run(async () => {
      try {
        await desktop.forget(entryId)
        setHere({ launcher: null, installed })
      } catch (error) {
        failed(error)
      }
    })

  const show = () => run(() => desktop.show(entryId).catch((error: unknown) => failed(error)))

  // A chosen file wins over Steam (spec section 19, decision 35); then the app I own, if
  // installed, or any of the game's apps Steam has installed here.
  const steamApp = steam?.owned && installed.includes(steam.owned) ? steam.owned : installed[0]
  const playLink = steamApp ? steamPlayLink(steamApp) : undefined
  const installLink = steam?.owned ? steamInstallLink(steam.owned) : undefined

  // Its saves being synced, as Steam's Play turns to Syncing: the game waits, and says how far.
  const share = shareOf(view?.syncing)
  const syncing = share === undefined ? t('gameSyncing') : t('gameSyncingShare', { share })

  let primary
  if (view?.state === 'starting' || playing) {
    // Pressed, its saves kept: they are looked at, and another computer's newer ones brought, before
    // it starts. The same button as Starting, so keyboard focus stays on it.
    const first = playing && view?.kept === true && view.state !== 'starting'
    primary = (
      <Button variant="primary" aria-disabled="true" className={waiting}>
        {first ? <RefreshCwIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        {first ? syncing : t('gameStarting')}
      </Button>
    )
  } else if (view?.state === 'running' || (view?.state === 'stopping' && view.unresponsive)) {
    primary = (
      <>
        {view.state === 'stopping' ? (
          // Inside what it asks about: a game that closes by itself takes the question with it.
          <Confirm
            title={t('forceTitle', { title })}
            description={t('forceBody')}
            confirm={t('gameForceStop')}
            cancel={t('forceCancel')}
            onConfirm={forceStop}
          >
            <Button variant="secondary">{t('gameForceStop')}</Button>
          </Confirm>
        ) : null}
        <Button
          variant="primary"
          onClick={busy ? undefined : stop}
          aria-disabled={busy || undefined}
          className={busy ? waiting : undefined}
        >
          <SquareIcon aria-hidden="true" />
          {t('gameStop')}
        </Button>
      </>
    )
  } else if (view?.state === 'stopping') {
    primary = (
      <Button variant="primary" aria-disabled="true" className={waiting}>
        <SquareIcon aria-hidden="true" />
        {t('gameStopping')}
      </Button>
    )
  } else if (view?.state === 'unverified') {
    primary = (
      <Tip describes label={t(`gameUnverified.${view.why ?? 'denied'}`)}>
        <Button variant="secondary" aria-disabled="true" className={waiting}>
          {t(view.why === 'open' ? 'gameOpen' : 'gameRunningShort')}
        </Button>
      </Tip>
    )
  } else if (view?.syncing) {
    // Backed up after it closed, or put back: Play comes back once that is done, or the line stalls.
    primary = (
      <Tip describes label={t('syncingTip', { title })}>
        <Button variant="primary" aria-disabled="true" className={waiting}>
          <RefreshCwIcon aria-hidden="true" />
          {syncing}
        </Button>
      </Tip>
    )
  } else if (launcher?.exists) {
    primary = (
      <Button variant="primary" onClick={() => void play()} disabled={busy}>
        <PlayIcon aria-hidden="true" />
        {t('play')}
      </Button>
    )
  } else if (!launcher && playLink) {
    primary = (
      <Button asChild variant="primary">
        <a href={playLink} onClick={state === 'unavailable' ? undefined : sentGameToSteam}>
          <PlayIcon aria-hidden="true" />
          {t('play')}
        </a>
      </Button>
    )
  } else if (!launcher && installLink) {
    primary = (
      <Button asChild variant="secondary">
        <a href={installLink}>{t('installOnSteam')}</a>
      </Button>
    )
  } else {
    primary = (
      <Button variant="secondary" onClick={choose} disabled={busy}>
        {launcher ? t('chooseAgain') : t('chooseFile')}
      </Button>
    )
  }

  // The menu holds what the primary button is not: the file's name and what can be done
  // with it, choosing one in place of Steam, or looking for a download. One button on this line and
  // the rest behind it, as a panel's column has room for no more.
  const menu = launcher || playLink || installLink
  return (
    <div ref={around} className={minePlay} data-play="">
      <span role="status" className="sr-only">
        {spoken}
      </span>
      <div className="flex items-center gap-1">
        {primary}
        {menu || hasSources ? (
          <DropdownMenu>
            <Tip label={t('playOptions')}>
              <DropdownMenuTrigger asChild>
                <Button ref={more} variant="ghost" size="icon" aria-label={t('playOptions')}>
                  <EllipsisIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent
              align="start"
              className="min-w-56"
              // Focus goes to what just opened, not back to this button.
              onCloseAutoFocus={(event) => {
                if (finding || saving) event.preventDefault()
              }}
            >
              {launcher ? (
                <>
                  {/* The whole path, wrapped: a menu's label takes no focus, so a tip could not show it. */}
                  <DropdownMenuLabel className="grid max-w-72 gap-0.5">
                    <span className="truncate">{launcher.name}</span>
                    <span className="text-xs font-normal break-all text-muted">
                      {launcher.path}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={choose}>{t('changeFile')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={show} disabled={!launcher.exists}>
                    {t('showFile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={forget}>{t('forgetFile')}</DropdownMenuItem>
                  {keepsSaves ? (
                    <>
                      <DropdownMenuSeparator />
                      <SavesItem onOpen={() => openSaves(false)} />
                    </>
                  ) : null}
                </>
              ) : menu ? (
                <DropdownMenuItem onSelect={choose}>{t('chooseFileInstead')}</DropdownMenuItem>
              ) : null}
              {hasSources ? (
                <>
                  {menu ? <DropdownMenuSeparator /> : null}
                  <FindDownloadItem
                    onOpen={() => {
                      setFinding(true)
                      setAsked(true)
                    }}
                  />
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {/* Once its saves are on: their state, after Play as Steam's Cloud status is in its play bar. */}
      {launcher && keepsSaves && view?.kept ? (
        <SavesStatusLater
          entryId={entryId}
          title={title}
          apps={steam?.known ?? noApps}
          syncing={view.syncing !== undefined}
          onOpen={(from) => openSaves(false, from)}
        />
      ) : null}
      {asked ? (
        <FindDownloadLater
          title={title}
          entryId={entryId}
          open={finding}
          onOpenChange={setFinding}
          returnFocus={back}
        />
      ) : null}
      {savesAsked ? (
        <SavesLater
          title={title}
          entryId={entryId}
          apps={steam?.known ?? noApps}
          open={saving}
          onOpenChange={(open) => {
            setSaving(open)
            if (!open) setChoosing(false)
          }}
          returnFocus={back}
          onPlay={
            choosing
              ? (look) => {
                  setSaving(false)
                  setChoosing(false)
                  void play(look)
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
