import { z } from 'zod'

/** The longest name one of my computers can be given. */
export const DEVICE_NAME_MAX = 40

/** A name for one of my computers, as typed: trimmed, and nothing left is no name. */
export const deviceName = z.string().trim().max(DEVICE_NAME_MAX)

/**
 * One of my computers with Shelf for Windows (ADR 005, section 12), as only I see it: the app's
 * random id for it, and the name I gave it. Never the computer's own name, which often holds a
 * person's.
 */
export type Device = {
  id: string
  /** Mine to give: absent until I have. */
  name?: string
  /** Its place among my computers, in the order Shelf first heard of them: what it is called until named. */
  number: number
  /** The start of its first session Shelf kept, and the end of its latest. */
  firstSeenAt?: number
  lastSeenAt?: number
}
