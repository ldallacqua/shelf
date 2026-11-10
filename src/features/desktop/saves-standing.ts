import { serviceNames, type Snapshot, type SavesView } from './saves'

/** Where this computer's backups go: a service by its name, a folder of the person's, or nowhere else. */
export type Destination =
  { kind: 'service'; name: string } | { kind: 'folder'; path: string } | { kind: 'here' }

/**
 * A game's saves in one answer, the one a person needs first (ADR 009, decision 5): whether they are
 * safe, where, and what needs them. The order is what matters most: a choice waiting, saves newer
 * than these, a destination that can't take them, backups waiting on this computer, then what was
 * last done. It never says a backup reached a place it is still waiting to go to.
 */
export type Standing =
  | { kind: 'off' }
  /** On, and nothing found to back up: the folder is the task. */
  | { kind: 'setup' }
  | { kind: 'choose' }
  | { kind: 'behind'; newer: Snapshot }
  | { kind: 'signed-out' | 'full' | 'unreachable'; to: Destination }
  | { kind: 'waiting'; to: Destination; at: number }
  /** Changed since the last backup, made `at`, or never backed up. */
  | { kind: 'changed'; to: Destination; at: number | undefined }
  | { kind: 'kept'; to: Destination; at: number }

export const destinationOf = (view: SavesView): Destination => {
  if (view.place === null) return { kind: 'here' }
  // An app older than 0.17.0 doesn't say which it is: a service is known by its name.
  const service = view.service ?? Object.values(serviceNames).some((name) => name === view.place)
  return service ? { kind: 'service', name: view.place } : { kind: 'folder', path: view.place }
}

export function standingOf(view: SavesView): Standing {
  if (!view.on) return { kind: 'off' }
  const to = destinationOf(view)
  if (view.state === 'choose') return { kind: 'choose' }
  const newer = view.snapshots.find((snapshot) => view.heads.includes(snapshot.id))
  if (view.state === 'behind' && newer) return { kind: 'behind', newer }
  if (to.kind !== 'here' && !view.reachable) return { kind: view.away ?? 'unreachable', to }
  const latest = view.snapshots[0]
  const waiting = view.snapshots.find((snapshot) => snapshot.waiting === true)
  if (to.kind !== 'here' && waiting) return { kind: 'waiting', to, at: waiting.createdAt }
  if (view.state === 'nothing' || (view.files === 0 && !latest)) return { kind: 'setup' }
  if (view.state === 'in-step' && latest) return { kind: 'kept', to, at: latest.createdAt }
  return { kind: 'changed', to, at: latest?.createdAt }
}

/** Whether it needs the person: drawn as a warning, in words and a mark, never in color alone. */
export const needsMe = (standing: Standing) =>
  standing.kind === 'setup' ||
  standing.kind === 'choose' ||
  standing.kind === 'signed-out' ||
  standing.kind === 'full'
