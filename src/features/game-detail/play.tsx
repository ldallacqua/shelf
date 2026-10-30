'use client'

import { EllipsisIcon, PlayIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useSyncExternalStore } from 'react'

import type { SteamApps } from '@/domain/library/editing'
import { steamInstallLink, steamPlayLink } from '@/domain/sync/steam'
import { desktop, inDesktopApp, refusalOf, type Launcher } from '@/features/desktop/bridge'
import { notify } from '@/features/shell/notices'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tip } from '@/ui/tooltip'

type PlayProps = {
  entryId: string
  title: string
  steam?: SteamApps
}

/**
 * Play, on my own game (spec 7.7). In Shelf for Windows it starts the game:
 * from the file chosen for it, or through Steam. In a browser, which cannot
 * start a file, it is what a browser can do: open Steam on a game the Steam
 * sync found I own, and not on a phone.
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
    <Button asChild variant="primary" size="sm" className="pointer-coarse:hidden">
      <a href={link} data-play="">
        <PlayIcon aria-hidden="true" />
        {t('playOnSteam')}
      </a>
    </Button>
  )
}

/** What this computer has for the game: its file, and its Steam apps installed here. */
type Here = { launcher: Launcher | null; installed: readonly string[] }

function PlayInApp({ entryId, title, steam }: PlayProps) {
  const t = useTranslations('Edit')
  const [here, setHere] = useState<Here>()
  const [busy, setBusy] = useState(false)

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

  if (!here) return null
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

  const play = () =>
    run(async () => {
      try {
        await desktop.play(entryId)
        notify({ message: t('starting', { title }) })
      } catch (error) {
        failed(error)
      }
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

  let primary
  if (launcher?.exists) {
    primary = (
      <Button variant="primary" size="sm" onClick={play} disabled={busy}>
        <PlayIcon aria-hidden="true" />
        {t('play')}
      </Button>
    )
  } else if (!launcher && playLink) {
    primary = (
      <Button asChild variant="primary" size="sm">
        <a href={playLink}>
          <PlayIcon aria-hidden="true" />
          {t('play')}
        </a>
      </Button>
    )
  } else if (!launcher && installLink) {
    primary = (
      <Button asChild variant="secondary" size="sm">
        <a href={installLink}>{t('installOnSteam')}</a>
      </Button>
    )
  } else {
    primary = (
      <Button variant="secondary" size="sm" onClick={choose} disabled={busy}>
        {launcher ? t('chooseAgain') : t('chooseFile')}
      </Button>
    )
  }

  // The menu holds what the primary button is not: the file's name and what can be done
  // with it, or choosing one in place of Steam.
  const menu = launcher || playLink || installLink
  return (
    <div className="flex items-center gap-1" data-play="">
      {primary}
      {menu ? (
        <DropdownMenu>
          <Tip label={t('playOptions')}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2" aria-label={t('playOptions')}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="min-w-56">
            {launcher ? (
              <>
                {/* The whole path, wrapped: a menu's label takes no focus, so a tip could not show it. */}
                <DropdownMenuLabel className="grid max-w-72 gap-0.5">
                  <span className="truncate">{launcher.name}</span>
                  <span className="text-xs font-normal break-all text-muted">{launcher.path}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={choose}>{t('changeFile')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={show} disabled={!launcher.exists}>
                  {t('showFile')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={forget}>{t('forgetFile')}</DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={choose}>{t('chooseFileInstead')}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
