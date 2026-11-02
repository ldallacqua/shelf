/**
 * pnpm i18n:check
 * Fails if any language is missing a text, has one English lacks, has an empty
 * one, or disagrees with English about a text's placeholders.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { compareMessages, type Messages } from './lib/compare-messages.ts'

const SOURCE = 'en'
const messages = join(import.meta.dirname, '..', 'messages')

function read(directory: string, locale: string): Messages {
  return JSON.parse(readFileSync(join(directory, `${locale}.json`), 'utf8')) as Messages
}

const locales = readdirSync(messages)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))

// `messages/app` holds the words only Shelf for Windows draws, which no page's HTML carries.
const problems = [messages, join(messages, 'app')].flatMap((directory) =>
  compareMessages(
    read(directory, SOURCE),
    Object.fromEntries(
      locales
        .filter((locale) => locale !== SOURCE)
        .map((locale) => [locale, read(directory, locale)]),
    ),
    SOURCE,
  ),
)

if (problems.length === 0) {
  console.log(`Translations agree across ${locales.join(', ')}.`)
} else {
  for (const problem of problems) {
    const detail = problem.detail ? ` (${problem.detail})` : ''
    console.error(`${problem.locale}: ${problem.kind} "${problem.key}"${detail}`)
  }
  console.error(`\n${problems.length} translation problem(s).`)
  process.exit(1)
}
