'use client'

import { useEffect, useState } from 'react'

import type { GameFacts } from '@/domain/library/game-page'
import type { Library } from '@/domain/library/library'
import { PrivateShelf } from '@/features/library/private-shelf'
import { useShelf } from '@/features/library/shelf'
import { factsAddress } from '@/features/library/shelf-address'
import { loadMine } from '@/features/library/use-library'
import { useAccount } from '@/features/owner/account'
import { useLibraryChange } from '@/features/owner/library-change'

import { LibraryLink } from './back-to-library'
import { GameDetail } from './game-detail'
import { GameMissing } from './game-missing'
import { GameSkeleton } from './game-skeleton'

/** One's own game, fetched fresh: the library it stands in, and what its page shows beyond it. */
const loadGame = async (slug: string): Promise<{ library: Library; facts?: GameFacts }> => {
  const [library, response] = await Promise.all([
    loadMine(),
    fetch(factsAddress({ kind: 'mine' }, 0, slug), { cache: 'no-store' }),
  ])
  if (response.status === 404) return { library }
  if (!response.ok) throw new Error(`A game's facts answered ${response.status}`)
  return { library, facts: (await response.json()) as GameFacts }
}

function MyGame({ slug, handle }: { slug: string; handle: string }) {
  const [own, setOwn] = useState<{ library: Library; facts?: GameFacts }>()
  const [failed, setFailed] = useState(false)
  // A change made here, in the editor below: read the game again, so all of the page shows it.
  const changed = useLibraryChange()?.version

  useEffect(() => {
    let current = true
    loadGame(slug)
      .then((loaded) => current && setOwn(loaded))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [slug, changed])

  if (failed) throw new Error('This game could not be read.')
  if (!own) return <GameSkeleton />
  const game = own.library.games.find((each) => each.slug === slug)
  if (!game || !own.facts) return <GameMissing />
  const platforms = new Map(own.facts.names.platform.map((platform) => [platform.id, platform]))
  return (
    <GameDetail
      layout="page"
      handle={handle}
      game={game}
      tags={game.tags.flatMap((position) => own.library.names.tag[position] ?? [])}
      platforms={platforms}
      facts={own.facts}
      above={<LibraryLink handle={handle} />}
      editable
    />
  )
}

/**
 * A game on a private shelf, opened at its own address (ADR 004): for the
 * shelf's account, drawn in the browser from `/api/v1/me/…`; for anyone
 * else, only that the shelf is private.
 */
export function PrivateGame({ slug }: { slug: string }) {
  const account = useAccount()
  const { handle } = useShelf()
  if (account.status === 'checking') return <GameSkeleton />
  if (account.status !== 'signed-in' || account.handle !== handle) return <PrivateShelf />
  return <MyGame slug={slug} handle={handle} />
}
