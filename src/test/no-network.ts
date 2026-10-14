import { EventEmitter } from 'node:events'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { network } from '@/test/network'

// The test doubles answer many requests over one pretend connection and add a
// listener to it for each. Past ten, Node warns of a leak that is not one.
EventEmitter.defaultMaxListeners = 50

// Unit tests never reach the real network. See `network.ts`.
beforeAll(() => network.listen({ onUnhandledFrame: 'error' }))
afterEach(() => network.resetHandlers())
afterAll(() => network.close())
