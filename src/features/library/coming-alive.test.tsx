import { act, Profiler, type ReactElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { setDevice } from '@/test/device'

import { useCollapsed } from './collapsed'
import type { Dimension } from './preferences'
import { useTooSmallFor3d } from './use-preference'

/**
 * A library drawn on the server comes alive in the browser without being
 * drawn again for what the server could not know but changes nothing on the
 * screen. On a slow phone that second drawing of the whole library was the
 * longest task after the first paint.
 */

function Shelf({ asked }: { asked: Dimension }) {
  const tooSmall = useTooSmallFor3d(asked)
  const folded = useCollapsed()
  return <p>{`${tooSmall ? 'too small' : 'room'}, ${folded.size} folded`}</p>
}

/** What React committed while the page came alive: `mount` for hydrating, then any redrawing. */
let commits: string[] = []

const page = (asked: Dimension): ReactElement => (
  <Profiler id="shelf" onRender={(_id, phase) => commits.push(phase)}>
    <Shelf asked={asked} />
  </Profiler>
)

let root: Root | undefined
let container: HTMLElement | undefined

/** Drawn as the server draws it, then brought to life as the browser does. */
const comeAlive = async (element: ReactElement) => {
  container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.append(container)
  commits = []
  await act(async () => {
    root = hydrateRoot(container!, element)
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

describe('a library coming alive', () => {
  it('is not drawn again on a phone that asks for 2D, with nothing folded', async () => {
    setDevice({ phone: true })
    const shelf = await comeAlive(page('2d'))
    expect(shelf).toHaveTextContent('room, 0 folded')
    expect(commits).toEqual(['mount'])
  })

  it('still learns a phone has no room for 3D, once 3D is what was asked for', async () => {
    setDevice({ phone: true })
    const shelf = await comeAlive(page('3d'))
    expect(shelf).toHaveTextContent('too small, 0 folded')
    expect(commits).toHaveLength(2)
  })
})
