import type { SetupStep } from '@/domain/setup/setup'

/**
 * Setting a shelf up grows with the product too (AGENTS.md, "Every feature is offered in setup
 * where it helps a new shelf"; spec 4.6): a feature that fills a new shelf, sets up how it looks or
 * who sees it, or is the next thing a new owner would reach for, is offered in the step where it
 * helps, in the same change. This map holds the two together: every numbered section of the spec,
 * by number, with the steps that offer it, or why it isn't part of starting a shelf.
 *
 * `coverage.test.ts` fails when the spec gains a section this map doesn't name, or keeps one the
 * spec dropped, and when a step offers nothing. The reasons are few on purpose: most of Shelf is
 * met while using a shelf, not needed to start one.
 */

/** Met while using the shelf: nothing about it needs choosing before the shelf is useful. */
const USE = 'Met while using the shelf; nothing to choose before it is useful.'
/** A rule every page keeps, not something a person sets up. */
const RULE = 'A rule every page keeps, not something to set up.'
const OWNER = 'The owner’s or a moderator’s alone.'
const EXPERIMENT = 'Behind Experimental views, off by default; offered once it is on for everyone.'

export const setupCoverage: Record<string, readonly SetupStep[] | string> = {
  '1': USE,
  '2': RULE,
  '2.1': ['bring', 'look'],
  '3': USE,
  '3.1': USE,
  '3.2': 'Definitions for the spec itself.',
  '3.3': EXPERIMENT,
  '3.4': USE,
  '3.5': USE,
  '3.6': EXPERIMENT,
  '3.7': USE,
  '3.8': USE,
  '3.9': USE,
  '3.10': RULE,
  '3.11': RULE,
  '3.12': USE,
  '3.13': 'A content choice in Settings, Privacy & content, made when it matters to someone.',
  '4': ['bring'],
  '4.1': ['bring'],
  '4.2': ['bring'],
  '4.2a': OWNER,
  '4.3': RULE,
  '4.4': ['play', 'bring'],
  '4.5': ['sort'],
  '4.6': ['play', 'bring', 'look', 'sort', 'ready'],
  '4.7': USE,
  '5': ['ready'],
  '5.1': USE,
  '5.2': USE,
  '5.3': ['ready'],
  '5.4': USE,
  '5.5': USE,
  '5.6': RULE,
  '6': USE,
  '7': USE,
  '7.1': USE,
  '7.2': USE,
  '7.3': USE,
  '7.4': USE,
  '7.5': USE,
  '7.6': USE,
  '7.7': ['ready'],
  '7.8': 'Achievements come with Steam’s sync, which step 2 offers.',
  '7.9': USE,
  '7.10': 'Shelf for Windows alone, set up in the app, and never shown before it.',
  '7.11': USE,
  '7.12': ['ready'],
  '8': 'Internals: how the data is kept.',
  '9': ['look'],
  '10': 'Chosen by the header’s switch on any page, before signing up too.',
  '11': ['ready'],
  '11.1': USE,
  '12': RULE,
  '13': RULE,
  '14': RULE,
  '15': 'The page before signing up.',
  '16': RULE,
  '17': ['ready'],
  '17a': OWNER,
  '18': 'Not built.',
  '19': 'Decisions, each where its feature is.',
}
